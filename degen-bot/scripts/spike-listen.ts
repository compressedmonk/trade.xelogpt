import { config } from "../src/config.js";
import { DiscordGateway } from "../src/discord/gateway.js";
import { resolveUserToken } from "../src/discord/token.js";
import { extractDegenCa } from "../src/discord/ca-filter.js";
import { log } from "../src/util/logger.js";

/** Discord snowflake → ms since epoch (delivery latency diagnostics). */
function snowflakeMs(id: string): number {
  return Number((BigInt(id) >> 22n) + 1420070400000n);
}

function main(): void {
  if (!config.userToken) throw new Error("DISCORD_USER_TOKEN required for spike");
  if (!config.channelId) throw new Error("DEGEN_CHANNEL_ID required for spike");

  const token = resolveUserToken();
  const ctx = { channelId: config.channelId, watchUserIds: config.watchUserIds };

  log.info("spike", `listening on channel=${config.channelId} (no buys) — Ctrl+C to stop`);
  if (ctx.watchUserIds.size === 0) {
    log.warn("spike", "DEGEN_WATCH_USER_ID empty — logging every post so you can find the user id");
  }

  const gateway = new DiscordGateway(token, {
    onReady: () => log.info("spike", "ready"),
    onMessageCreate: (msg) => {
      if (msg.channel_id !== config.channelId) return;
      const latency = Date.now() - snowflakeMs(msg.id);
      const author = msg.author?.id ?? "?";
      const preview = (msg.content ?? "").replace(/\s+/g, " ").slice(0, 80);
      const match = extractDegenCa(msg, ctx);
      const tag = match ? `MATCH mint=${match}` : "no-match";
      log.info("spike", `${tag} author=${author} latency=${latency}ms content="${preview}"`);
    },
  });

  process.on("SIGINT", () => {
    gateway.stop();
    process.exit(0);
  });

  gateway.start();
}

main();
