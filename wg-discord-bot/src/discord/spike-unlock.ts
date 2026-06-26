import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { navigateToTradesChannel } from "./navigate.js";
import { setEnvValue } from "./save-env.js";
import { parseGatewayEvent, parseRestMessages } from "./gateway-parser.js";
import {
  applyUnlocked,
  isUnlockTeaser,
  isWgBotMessage,
  normalizeGatewayMessage,
} from "./normalize.js";
import {
  attachInteractionCapture,
  clickAllVisibleUnlockButtons,
  createInteractionPendingMap,
  resolveInteractionPending,
  scrollChannelToLoadHistory,
  unlockTeaser,
} from "./unlock.js";
import type { RawDiscordMessage, UnlockResult } from "../types.js";

const seen = new Set<string>();
const teasers: RawDiscordMessage[] = [];
const unlockResults: UnlockResult[] = [];
const unlockedMessages: RawDiscordMessage[] = [];
let activeTradesChannelId = config.tradesChannelId;

const diagnostics = {
  channelName: "",
  resolvedChannelId: "",
  restMessageCount: 0,
  wgBotMessageCount: 0,
  gatewayMessageCount: 0,
  domUnlockButtonsClicked: 0,
  sampleAuthors: [] as string[],
};

const pendingInteractions = createInteractionPendingMap();
const unlockQueue: RawDiscordMessage[] = [];
let processingUnlock = false;

function recordTeaser(msg: RawDiscordMessage): void {
  if (seen.has(msg.id)) return;

  if (diagnostics.sampleAuthors.length < 8 && !diagnostics.sampleAuthors.includes(msg.authorName)) {
    diagnostics.sampleAuthors.push(msg.authorName);
  }

  if (isWgBotMessage(msg, config.wgBotDisplayName)) {
    diagnostics.wgBotMessageCount++;
  }

  if (!isUnlockTeaser(msg)) return;
  if (!isWgBotMessage(msg, config.wgBotDisplayName)) return;
  if (activeTradesChannelId && msg.channelId !== activeTradesChannelId) return;

  seen.add(msg.id);
  teasers.push(msg);
  unlockQueue.push(msg);

  console.log(`\n--- UNLOCK TEASER (${msg.source}) ---`);
  console.log(`id: ${msg.id}`);
  console.log(`content: ${msg.content.slice(0, 120)}`);
}

async function processUnlockQueue(page: Page): Promise<void> {
  if (processingUnlock) return;
  processingUnlock = true;

  while (unlockQueue.length > 0) {
    const msg = unlockQueue.shift()!;
    if (unlockResults.some((r) => r.messageId === msg.id && r.success)) continue;

    console.log(`\n>>> Unlocking message ${msg.id}...`);
    const result = await unlockTeaser(page, msg, pendingInteractions);
    unlockResults.push(result);

    if (result.success) {
      const unlocked = applyUnlocked(msg, {
        content: result.content,
        embedTitle: result.embedTitle,
        embedDescription: result.embedDescription,
        source: result.source ?? "interaction",
      });
      unlockedMessages.push(unlocked);
      console.log(
        `>>> SUCCESS (${result.source}): ${(result.content ?? result.embedTitle ?? "").slice(0, 200)}`,
      );
    } else {
      console.log(`>>> FAILED: ${result.error}`);
    }

    await page.waitForTimeout(500);
  }

  processingUnlock = false;
}

function attachGatewayListener(page: Page): void {
  page.on("websocket", (ws) => {
    if (!ws.url().includes("gateway.discord")) return;

    ws.on("framereceived", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      const event = parseGatewayEvent(text);
      if (!event) return;

      const msg = normalizeGatewayMessage(event.message, "gateway");
      if (!msg) return;

      if (event.type === "MESSAGE_CREATE") {
        diagnostics.gatewayMessageCount++;
        recordTeaser(msg);
        void processUnlockQueue(page);
      }
    });
  });
}

function attachRestListener(page: Page): void {
  page.on("response", async (response) => {
    const url = response.url();

    const chMatch = url.match(/\/api\/v\d+\/channels\/(\d+)$/);
    if (chMatch && response.status() === 200) {
      try {
        const body = (await response.json()) as { name?: string };
        if (body.name) diagnostics.channelName = body.name;
      } catch {
        // ignore
      }
    }

    if (!/\/api\/v\d+\/channels\/\d+\/messages/.test(url)) return;
    if (response.status() !== 200) return;

    try {
      const body = await response.json();
      const messages = parseRestMessages(body);
      diagnostics.restMessageCount += messages.length;

      for (const raw of messages) {
        const msg = normalizeGatewayMessage(raw, "rest");
        if (!msg) continue;
        recordTeaser(msg);
      }
    } catch {
      // ignore
    }
  });
}

async function domFallbackUnlock(page: Page): Promise<void> {
  console.log("\n--- DOM fallback: scroll + Unlock gombok keresése ---");
  await scrollChannelToLoadHistory(page);
  await page.waitForTimeout(2_000);

  const clicked = await clickAllVisibleUnlockButtons(page);
  diagnostics.domUnlockButtonsClicked = clicked;
  console.log(`DOM: ${clicked} Unlock gomb kattintva`);

  if (clicked > 0) {
    await page.waitForTimeout(3_000);
  }
}

async function saveResults(): Promise<string> {
  const outDir = join(process.cwd(), "spike-output");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `spike-unlock-${Date.now()}.json`);

  await writeFile(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        diagnostics,
        teasersFound: teasers.length,
        unlockAttempts: unlockResults.length,
        unlockSuccess: unlockResults.filter((r) => r.success).length,
        teasers,
        unlockResults,
        unlockedMessages,
      },
      null,
      2,
    ),
  );

  return outPath;
}

async function main(): Promise<void> {
  if (!config.guildId) {
    console.error("Missing DISCORD_GUILD_ID in .env");
    process.exit(1);
  }
  if (!config.tradesChannelId) {
    console.log("DISCORD_TRADES_CHANNEL_ID üres — a script megkeresi #trades-t a sidebar-ban.\n");
  }

  if (!existsSync(config.profileDir)) {
    console.error(`No Discord session at ${config.profileDir}`);
    console.error("Run first: npm run discord:login");
    process.exit(1);
  }

  const durationMs = config.spikeDurationMs;
  const listenForever = durationMs <= 0;

  console.log("Phase 0b spike — Unlock Content flow");
  console.log(`Channel ID: ${config.tradesChannelId}`);
  console.log(`WG Bot: "${config.wgBotDisplayName}"`);
  if (listenForever) {
    console.log("Figyelés: VÉGTELEN (állítsd le Ctrl+C-vel, ha kész)\n");
  } else {
    console.log(`Figyelés: ${durationMs / 1000}s, utána leáll\n`);
  }

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await context.newPage();

  attachInteractionCapture(page, (messageId, content) => {
    resolveInteractionPending(pendingInteractions, messageId, content);
    console.log(`\n>>> Interaction capture: ${(content.content ?? "").slice(0, 150)}`);

    unlockResults.push({
      messageId: messageId ?? "dom",
      success: true,
      source: content.source,
      content: content.content,
      embedTitle: content.embedTitle,
      embedDescription: content.embedDescription,
    });
  });
  attachGatewayListener(page);
  attachRestListener(page);

  const nav = await navigateToTradesChannel(page, () => diagnostics.channelName);

  if (nav) {
    activeTradesChannelId = nav.channelId;
    diagnostics.channelName = nav.channelName;
    diagnostics.resolvedChannelId = nav.channelId;

    if (nav.channelId !== config.tradesChannelId) {
      await setEnvValue("DISCORD_TRADES_CHANNEL_ID", nav.channelId);
      console.log(`  .env frissítve: DISCORD_TRADES_CHANNEL_ID=${nav.channelId}`);
    }

    console.log(`\nAktív csatorna: #${nav.channelName} (${nav.channelId})`);
  } else if (teasers.length > 0) {
    activeTradesChannelId = teasers[0]!.channelId;
    diagnostics.resolvedChannelId = activeTradesChannelId;
    console.log(
      `\n⚠️  Navigáció nem erősítette meg, de ${teasers.length} unlock teaser érkezett.`,
    );
    console.log(`    Csatorna ID a teaserekből: ${activeTradesChannelId}`);
    await setEnvValue("DISCORD_TRADES_CHANNEL_ID", activeTradesChannelId);
  } else {
    await context.close();
    process.exit(2);
  }

  await processUnlockQueue(page);

  if (teasers.length === 0) {
    await domFallbackUnlock(page);
  }

  console.log(`\nDiagnosztika: REST msgs=${diagnostics.restMessageCount}, WG Bot=${diagnostics.wgBotMessageCount}, Gateway=${diagnostics.gatewayMessageCount}`);
  console.log(`Authors minta: ${diagnostics.sampleAuthors.join(", ") || "(nincs)"}`);

  let stoppedByUser = false;
  const onSigInt = () => {
    stoppedByUser = true;
    console.log("\n\nLeállítás (Ctrl+C)...");
  };
  process.on("SIGINT", onSigInt);

  console.log(
    listenForever
      ? "\nFigyelek új WG Bot trade-re… (Ctrl+C = leállítás és mentés)"
      : `\nFigyelek ${durationMs / 1000}s-ig új trade-re…`,
  );

  const queueInterval = setInterval(() => {
    void processUnlockQueue(page);
  }, 2_000);

  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    const ok = unlockResults.filter((r) => r.success).length;
    if (listenForever) {
      console.log(
        `  … ${elapsedSec}s eltelt | teasers: ${teasers.length} | unlock OK: ${ok} | Ctrl+C leállítás`,
      );
    } else {
      const left = Math.max(0, Math.floor((durationMs - (Date.now() - startedAt)) / 1000));
      console.log(
        `  … még ${left}s | teasers: ${teasers.length} | unlock OK: ${ok}`,
      );
    }
  }, 30_000);

  while (!stoppedByUser) {
    if (unlockResults.some((r) => r.success)) {
      console.log("\n✓ Sikeres unlock — eredmény mentése…");
      break;
    }
    if (!listenForever && Date.now() - startedAt >= durationMs) {
      console.log("\nIdőtúllépés — SPIKE_DURATION_MS lejárt.");
      break;
    }
    await page.waitForTimeout(1_000);
  }

  clearInterval(queueInterval);
  clearInterval(heartbeat);
  process.off("SIGINT", onSigInt);

  await processUnlockQueue(page);

  const outPath = await saveResults();

  console.log("\n=== UNLOCK SPIKE RESULT ===");
  console.log(`Channel: #${diagnostics.channelName || "?"}`);
  console.log(`Teasers found: ${teasers.length}`);
  console.log(`Unlock attempts: ${unlockResults.length}`);
  console.log(`Unlock success: ${unlockResults.filter((r) => r.success).length}`);
  console.log(`Output: ${outPath}`);

  const anySuccess = unlockResults.some((r) => r.success);

  if (teasers.length === 0 && diagnostics.restMessageCount === 0) {
    console.log("\nNO-GO: Egy üzenet sem érkezett — rossz csatorna ID vagy session.");
    console.log("  → npm run discord:pick -- trades");
    await context.close();
    process.exit(2);
  }

  if (teasers.length === 0 && !anySuccess) {
    console.log("\nPARTIAL: Nem volt unlock teaser / siker ebben a futásban.");
    if (!listenForever && !stoppedByUser) {
      console.log("  → Állítsd SPIKE_DURATION_MS=0 a .env-ben végtelen figyeléshez, vagy Ctrl+C nélkül várj tovább.");
    }
    console.log("  → npm run discord:pick -- trades  (ha rossz csatorna)");
    await context.close();
    process.exit(1);
  }

  if (anySuccess) {
    console.log("\nGO: Unlock flow works. Proceed to parser + Binance.");
    await context.close();
    process.exit(0);
  }

  console.log("\nNO-GO: Teasers seen but unlock failed — check DOM selectors.");
  await context.close();
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
