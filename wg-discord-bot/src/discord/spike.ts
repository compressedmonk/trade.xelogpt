import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertSpikeConfig, channelUrl, config } from "../config.js";
import { parseGatewayFrame, parseRestMessages } from "./gateway-parser.js";
import {
  extractTraderMention,
  isWatchedChannel,
  isWgBotMessage,
  normalizeGatewayMessage,
} from "./normalize.js";
import type { RawDiscordMessage } from "../types.js";

const watchedChannelIds = () =>
  [config.tradesChannelId, config.alertsChannelId].filter(Boolean);

const seen = new Set<string>();
const captured: RawDiscordMessage[] = [];

function record(msg: RawDiscordMessage): void {
  if (seen.has(msg.id)) return;
  seen.add(msg.id);
  captured.push(msg);

  const channel =
    msg.channelId === config.tradesChannelId
      ? "#trades"
      : msg.channelId === config.alertsChannelId
        ? "#active-alerts"
        : msg.channelId;

  const wg = isWgBotMessage(msg, config.wgBotDisplayName) ? " [WG Bot]" : "";
  const trader = extractTraderMention(msg.content);
  const traderTag = trader ? ` @${trader}` : "";

  console.log(`\n--- CAPTURED (${msg.source})${wg} ${channel}${traderTag} ---`);
  console.log(`id: ${msg.id}`);
  if (msg.content) console.log(`content: ${msg.content.slice(0, 200)}`);
  if (msg.embedTitle) console.log(`embed.title: ${msg.embedTitle}`);
  if (msg.embedDescription) console.log(`embed.desc: ${msg.embedDescription.slice(0, 200)}`);
}

function handleGatewayPayload(payload: string): void {
  const raw = parseGatewayFrame(payload);
  if (!raw) return;

  const msg = normalizeGatewayMessage(raw, "gateway");
  if (!msg || !isWatchedChannel(msg, watchedChannelIds())) return;

  record(msg);
}

function attachGatewayListener(page: Page): void {
  page.on("websocket", (ws) => {
    const url = ws.url();
    if (!url.includes("gateway.discord")) return;

    ws.on("framereceived", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      handleGatewayPayload(text);
    });
  });
}

function attachRestListener(page: Page): void {
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/v9/channels/") || !url.includes("/messages")) return;
    if (response.status() !== 200) return;

    try {
      const body = await response.json();
      for (const raw of parseRestMessages(body)) {
        const msg = normalizeGatewayMessage(raw, "rest");
        if (!msg || !isWatchedChannel(msg, watchedChannelIds())) continue;
        record(msg);
      }
    } catch {
      // ignore parse errors
    }
  });
}

async function openChannel(context: BrowserContext, channelId: string, label: string): Promise<Page> {
  const page = await context.newPage();
  attachGatewayListener(page);
  attachRestListener(page);

  const url = channelUrl(channelId);
  console.log(`Opening ${label}: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  return page;
}

async function saveResults(): Promise<string> {
  const outDir = join(process.cwd(), "spike-output");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `spike-${Date.now()}.json`);

  const wgMessages = captured.filter((m) => isWgBotMessage(m, config.wgBotDisplayName));
  const followed = wgMessages.filter((m) => {
    const trader = extractTraderMention(m.content);
    if (!trader) return true; // trades channel mentions at start too
    return config.followedTraders.some(
      (t) => t.toLowerCase() === trader.toLowerCase(),
    );
  });

  await writeFile(
    outPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        total: captured.length,
        wgBot: wgMessages.length,
        followedTrader: followed.length,
        messages: captured,
      },
      null,
      2,
    ),
  );

  return outPath;
}

async function main(): Promise<void> {
  assertSpikeConfig();

  if (!existsSync(config.profileDir)) {
    console.error(`No Discord session at ${config.profileDir}`);
    console.error("Run first: npm run discord:login");
    process.exit(1);
  }

  console.log("Phase 0 spike — Discord message capture");
  console.log(`Watching channels: ${watchedChannelIds().join(", ")}`);
  console.log(`WG Bot filter: "${config.wgBotDisplayName}"`);
  console.log(`Followed traders: ${config.followedTraders.join(", ")}`);
  console.log(`Duration: ${config.spikeDurationMs}ms\n`);

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const pages: Page[] = [];

  if (config.tradesChannelId) {
    pages.push(await openChannel(context, config.tradesChannelId, "#trades"));
  }
  if (config.alertsChannelId) {
    pages.push(await openChannel(context, config.alertsChannelId, "#active-alerts"));
  }

  console.log(`\nListening for ${config.spikeDurationMs / 1000}s... (live + backfill via REST)`);

  await new Promise((r) => setTimeout(r, config.spikeDurationMs));

  const outPath = await saveResults();

  const wgCount = captured.filter((m) => isWgBotMessage(m, config.wgBotDisplayName)).length;

  console.log("\n=== SPIKE RESULT ===");
  console.log(`Total messages captured: ${captured.length}`);
  console.log(`WG Bot messages: ${wgCount}`);
  console.log(`Output: ${outPath}`);

  if (captured.length === 0) {
    console.log("\nNO-GO: No messages captured. Check session (npm run discord:login) or channel IDs.");
    await context.close();
    process.exit(2);
  }

  if (wgCount === 0) {
    console.log("\nPARTIAL: Messages captured but no WG Bot — check WG_BOT_DISPLAY_NAME or wait for new posts.");
  } else {
    console.log("\nGO: Discord capture works. Proceed to parser + Binance phases.");
  }

  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
