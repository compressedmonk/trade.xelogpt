import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { config } from "../config.js";
import {
  channelIdFromDiscordUrl,
  findAlertsChannel,
  findTradesChannel,
  parseGuildChannels,
} from "./guild-channels.js";
import { isAlertsChannelName, isTradesChannelName } from "./navigate.js";
import { setEnvValue } from "./save-env.js";

type Target = "trades" | "alerts";

const ENV_KEY: Record<Target, string> = {
  trades: "DISCORD_TRADES_CHANNEL_ID",
  alerts: "DISCORD_ALERTS_CHANNEL_ID",
};

async function main(): Promise<void> {
  const target = (process.argv[2] ?? "trades") as Target;
  if (target !== "trades" && target !== "alerts") {
    console.error("Usage: npm run discord:pick -- trades|alerts");
    process.exit(1);
  }

  if (!config.guildId) {
    console.error("Set DISCORD_GUILD_ID in .env first");
    process.exit(1);
  }

  await mkdir(config.profileDir, { recursive: true });

  console.log(`Pick channel for: ${target}`);
  console.log(
    `1. Nyisd meg a Wealth Group szervert\n2. Kattints a #${target === "trades" ? "trades" : "active-alerts"} csatornára\n3. Várj 1-2 mp-et, majd zárd be a böngészőt\n`,
  );

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  const channelNames = new Map<string, string>();
  let saved = false;

  const trySave = async (channelId: string, name?: string): Promise<void> => {
    if (saved || !channelId) return;

    const label = name ?? channelNames.get(channelId) ?? "";
    if (target === "trades" && label && !isTradesChannelName(label)) {
      console.warn(`\n⚠️  Ez nem úgy néz ki mint #trades: #${label}`);
      console.warn("    Ha biztos vagy benne, kattints újra a trades csatornára.\n");
      return;
    }
    if (target === "alerts" && label && !isAlertsChannelName(label)) {
      console.warn(`\n⚠️  Ez nem úgy néz ki mint #active-alerts: #${label}`);
      console.warn("    Ha biztos vagy benne, kattints újra az active-alerts csatornára.\n");
      return;
    }

    await setEnvValue(ENV_KEY[target], channelId);
    saved = true;
    console.log(`\n✓ ${label ? `#${label}` : "channel"} → ${ENV_KEY[target]}=${channelId}`);
    console.log("Mentve .env-be. Bezárhatod a böngészőt.");
  };

  const onResponse = async (response: { url: () => string; status: () => number; json: () => Promise<unknown> }) => {
    if (saved) return;
    const url = response.url();
    if (response.status() !== 200) return;

    try {
      if (/\/api\/v\d+\/guilds\/\d+\/channels/.test(url)) {
        const channels = parseGuildChannels(await response.json());
        for (const ch of channels) channelNames.set(ch.id, ch.name);

        const match = target === "trades" ? findTradesChannel(channels) : findAlertsChannel(channels);
        if (match) {
          console.log(`  Auto: #${match.name} → ${match.id}`);
          await trySave(match.id, match.name);
        }
        return;
      }

      const m = url.match(/\/api\/v\d+\/channels\/(\d+)(?:\?|$)/);
      if (m) {
        const body = (await response.json()) as { id?: string; name?: string };
        if (!body?.id) return;
        if (body.name) channelNames.set(body.id, body.name);
        console.log(`  API: #${body.name ?? "?"} → ${body.id}`);
        await trySave(body.id, body.name);
      }
    } catch {
      // ignore
    }
  };

  context.on("page", (p) => {
    p.on("response", (r) => void onResponse(r));
    p.on("framenavigated", (frame) => {
      if (frame !== p.mainFrame()) return;
      const ids = channelIdFromDiscordUrl(frame.url());
      if (!ids || ids.guildId !== config.guildId) return;
      const name = channelNames.get(ids.channelId);
      console.log(`  URL: ${name ? `#${name}` : "channel"} → ${ids.channelId}`);
      void trySave(ids.channelId, name);
    });
  });

  page.on("response", (r) => void onResponse(r));
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const ids = channelIdFromDiscordUrl(frame.url());
    if (!ids || ids.guildId !== config.guildId) return;
    const name = channelNames.get(ids.channelId);
    console.log(`  URL: ${name ? `#${name}` : "channel"} → ${ids.channelId}`);
    void trySave(ids.channelId, name);
  });

  await page.goto(`https://discord.com/channels/${config.guildId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline && context.pages().length > 0 && !saved) {
    try {
      await page.waitForTimeout(1_000);
    } catch {
      break;
    }
  }

  await context.close().catch(() => {});

  if (!saved) {
    console.error("\nNem sikerült csatorna ID mentése.");
    console.error("Próbáld: npm run discord:discover  (automatikus keresés mindkét csatornára)");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
