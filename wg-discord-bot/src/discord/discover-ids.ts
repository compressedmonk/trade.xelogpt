import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";
import {
  channelIdFromDiscordUrl,
  findAlertsChannel,
  findTradesChannel,
  parseGuildChannels,
  type GuildChannel,
} from "./guild-channels.js";
import { isAlertsChannelName, isTradesChannelName } from "./navigate.js";

async function updateEnv(
  guildId: string,
  tradesId: string,
  alertsId: string,
  partial = false,
): Promise<void> {
  const envPath = resolve(process.cwd(), ".env");
  let content = existsSync(envPath)
    ? await readFile(envPath, "utf8")
    : await readFile(resolve(process.cwd(), ".env.example"), "utf8");

  const set = (key: string, value: string) => {
    if (!value) return;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  };

  set("DISCORD_GUILD_ID", guildId);
  set("DISCORD_TRADES_CHANNEL_ID", tradesId);
  set("DISCORD_ALERTS_CHANNEL_ID", alertsId);

  await writeFile(envPath, content);
  if (partial) {
    console.log("\n(partial .env update — hiányzó mezőket kattintással töltjük)");
  } else {
    console.log("\nWritten to .env");
  }
}

function registerFromChannel(
  ch: Pick<GuildChannel, "id" | "name">,
  state: { tradesId: string; alertsId: string },
): void {
  if (isTradesChannelName(ch.name) && !state.tradesId) {
    state.tradesId = ch.id;
    console.log(`\n→ #trades: "${ch.name}" = ${ch.id}`);
  }
  if (isAlertsChannelName(ch.name) && !state.alertsId) {
    state.alertsId = ch.id;
    console.log(`→ #active-alerts: "${ch.name}" = ${ch.id}`);
  }
}

async function main(): Promise<void> {
  await mkdir(config.profileDir, { recursive: true });

  console.log("Discord ID discovery");
  console.log("====================\n");
  console.log("1. Kattints a Wealth Group szerverre");
  console.log("2. Kattints a #trades csatornára (pl. 🚀 | trades)");
  console.log("3. Kattints a #active-alerts csatornára");
  console.log("4. Zárd be a böngészőt ha mindkettő megvan\n");

  const guildChannels = new Map<string, GuildChannel[]>();
  const channelNames = new Map<string, string>();
  const visited = new Set<string>();
  let guildId = config.guildId || "";
  const state = { tradesId: config.tradesChannelId || "", alertsId: config.alertsChannelId || "" };

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] ?? (await context.newPage());

  const onResponse = async (response: { url: () => string; status: () => number; json: () => Promise<unknown> }) => {
    const url = response.url();
    if (response.status() !== 200) return;

    try {
      if (/\/api\/v\d+\/guilds\/\d+\/channels/.test(url)) {
        const body = parseGuildChannels(await response.json());
        if (body.length === 0) return;

        const gMatch = url.match(/\/guilds\/(\d+)\//);
        const gId = gMatch?.[1] ?? "";
        if (gId) {
          guildId = gId;
          guildChannels.set(gId, body);
          for (const ch of body) {
            channelNames.set(ch.id, ch.name);
            registerFromChannel(ch, state);
          }
        }
        return;
      }

      const chMatch = url.match(/\/api\/v\d+\/channels\/(\d+)(?:\?|$)/);
      if (chMatch) {
        const body = (await response.json()) as GuildChannel;
        if (!body?.id || !body?.name) return;

        channelNames.set(body.id, body.name);
        if (body.guild_id) guildId = body.guild_id;

        console.log(`  Channel: #${body.name} → ${body.id}`);
        registerFromChannel(body, state);
        await updateEnv(guildId, state.tradesId, state.alertsId, true);
      }
    } catch {
      // ignore
    }
  };

  const onNavigate = (frameUrl: string) => {
    const ids = channelIdFromDiscordUrl(frameUrl);
    if (!ids) return;
    if (ids.guildId) guildId = ids.guildId;
    visited.add(ids.channelId);
    const name = channelNames.get(ids.channelId);
    console.log(`  URL: ${name ? `#${name}` : "channel"} → ${ids.channelId}`);
    if (name) registerFromChannel({ id: ids.channelId, name }, state);
  };

  context.on("page", (p) => {
    p.on("response", (r) => void onResponse(r));
    p.on("framenavigated", (frame) => {
      if (frame === p.mainFrame()) onNavigate(frame.url());
    });
  });
  page.on("response", (r) => void onResponse(r));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) onNavigate(frame.url());
  });

  const startGuild = guildId || "742797926761234463";
  await page.goto(`https://discord.com/channels/${startGuild}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline && context.pages().length > 0) {
    try {
      await page.waitForTimeout(2_000);
    } catch {
      break;
    }

    for (const [, channels] of guildChannels) {
      const trades = findTradesChannel(channels);
      const alerts = findAlertsChannel(channels);
      if (trades && !state.tradesId) {
        state.tradesId = trades.id;
        console.log(`\n→ #trades (scan): "${trades.name}" = ${trades.id}`);
      }
      if (alerts && !state.alertsId) {
        state.alertsId = alerts.id;
        console.log(`→ #active-alerts (scan): "${alerts.name}" = ${alerts.id}`);
      }
    }

    if (guildId && state.tradesId && state.alertsId) {
      console.log("\n✓ Mindkét csatorna megvan — bezárhatod a böngészőt.");
      break;
    }
  }

  if (guildId && state.tradesId && state.alertsId) {
    console.log("\n=== FOUND ===");
    console.log(`DISCORD_GUILD_ID=${guildId}`);
    console.log(`DISCORD_TRADES_CHANNEL_ID=${state.tradesId}`);
    console.log(`DISCORD_ALERTS_CHANNEL_ID=${state.alertsId}`);
    await updateEnv(guildId, state.tradesId, state.alertsId);
  } else {
    console.log("\n=== INCOMPLETE ===");
    if (guildId) console.log(`DISCORD_GUILD_ID=${guildId}`);
    if (state.tradesId) console.log(`DISCORD_TRADES_CHANNEL_ID=${state.tradesId}`);
    if (state.alertsId) console.log(`DISCORD_ALERTS_CHANNEL_ID=${state.alertsId}`);

    const channels = guildChannels.get(guildId) ?? [];
    if (channels.length > 0) {
      console.log("\nSzöveges csatornák (guild API):");
      for (const ch of channels.filter((c) => c.type === 0 || c.type === 5)) {
        const tag = isTradesChannelName(ch.name)
          ? " [trades?]"
          : isAlertsChannelName(ch.name)
            ? " [alerts?]"
            : "";
        console.log(`  #${ch.name} → ${ch.id}${tag}`);
      }
    }

    if (visited.size > 0) {
      console.log("\nLátogatott csatornák (URL):");
      for (const id of visited) {
        const name = channelNames.get(id);
        console.log(`  ${name ? `#${name}` : "(név ismeretlen)"} → ${id}`);
      }
    }

    if (!state.alertsId && visited.size > 0 && state.tradesId) {
      const candidates = [...visited].filter((id) => {
        if (id === state.tradesId) return false;
        const name = channelNames.get(id) ?? "";
        if (name && isTradesChannelName(name)) return false;
        if (name && /announcement/i.test(name)) return false;
        return true;
      });
      if (candidates.length >= 1) {
        const id = candidates[candidates.length - 1];
        const name = channelNames.get(id) ?? "?";
        console.log(`\n💡 #active-alerts (utolsó nem-trades kattintás):`);
        console.log(`   DISCORD_ALERTS_CHANNEL_ID=${id}  (#${name})`);
        state.alertsId = id;
      }
    }

    if (guildId) {
      await updateEnv(guildId, state.tradesId, state.alertsId, true);
    }
  }

  await context.close().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
