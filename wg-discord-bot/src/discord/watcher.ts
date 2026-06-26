import { chromium, type Page } from "playwright";
import type { BrowserContext, Response } from "playwright";
import { existsSync } from "node:fs";
import { channelUrl, config } from "../config.js";
import { TradeStore } from "../db/store.js";
import { executeAlert } from "../executor/alert-actions.js";
import { placeDcaTrade } from "../executor/place-dca-trade.js";
import { looksLikeWgAlert, parseAlert } from "../parser/alert-signal.js";
import { parseLimitSignal } from "../parser/limit-signal.js";
import { isFollowedTrader } from "../parser/trader-filter.js";
import { log } from "../util/logger.js";
import { isMessageOlderThan } from "../util/snowflake.js";
import { backfillChannelMessages } from "./backfill.js";
import { isUnlockInProgress, setUnlockInProgress } from "./unlock-guard.js";
import { createQueuePump } from "./queue-pump.js";
import { attachChannelRegistry } from "./channel-registry.js";
import { parseGatewayEvent } from "./gateway-parser.js";
import { messageText } from "./message-text.js";
import { navigateToAlertsChannel, navigateToTradesChannel } from "./navigate.js";
import {
  applyUnlocked,
  extractTraderMention,
  isDirectLimitSignal,
  isUnlockTeaser,
  isWgBotMessage,
  isWatchedChannel,
  normalizeGatewayMessage,
} from "./normalize.js";
import { setEnvValue } from "./save-env.js";
import {
  attachInteractionCapture,
  classifyUnlockError,
  createInteractionPendingMap,
  resolveInteractionPending,
  scanVisibleUnlockTeasers,
  scrollChannelToPresent,
  unlockTeaser,
  waitForTradesChannelReady,
} from "./unlock.js";
import type { RawDiscordMessage } from "../types.js";

type TradeJob = { msg: RawDiscordMessage; mode: "unlock" | "direct"; trader: string };

interface ChannelState {
  channelId: string;
  channelName: string;
  page: Page;
}

/** id -> content signature, so a MESSAGE_UPDATE with new content is reprocessed. */
const contentSeen = new Map<string, string>();
let tradesChannelId = config.tradesChannelId;
let alertsChannelId = config.alertsChannelId;

const urgentQueue: RawDiscordMessage[] = [];
const tradeQueue: TradeJob[] = [];

// Single serialized pump: urgent is always drained before trades, and the two
// never run concurrently (avoids alert-before-trade-row races).
let tradesPageRef: Page | null = null;

const stats = {
  messagesSeen: 0,
  wgMessages: 0,
  unlockQueued: 0,
  directQueued: 0,
  alertsQueued: 0,
  gatewayFrames: 0,
  gatewayParsed: 0,
  gatewayBinary: 0,
};

const pendingInteractions = createInteractionPendingMap();
const store = new TradeStore(config.dbPath);

// Unlock retry state: transient DOM problems get a cooldown (retried later by
// the DOM scan), only genuine unlock failures count toward the hard cap.
const unlockHardFailures = new Map<string, number>();
const unlockCooldownUntil = new Map<string, number>();
const unlockSucceeded = new Set<string>();
const MAX_UNLOCK_HARD_FAILURES = 3;
const UNLOCK_COOLDOWN_MS = 30_000;
/** Discord often leaves Unlock visible after click — DOM scan only recent teasers. */
const MAX_DOM_UNLOCK_AGE_MS = 2 * 60 * 60 * 1000;
let watcherReady = false;

function loadPersistedUnlocks(): void {
  for (const id of store.listUnlockedDiscordMsgIds()) {
    unlockSucceeded.add(id);
  }
  if (unlockSucceeded.size > 0) {
    console.log(`  Unlocked teasers in journal: ${unlockSucceeded.size} (buttons may still show in Discord)`);
  }
}

/** Discord snowflake → approximate message age. */
function isTooOldForBackfill(id: string): boolean {
  return isMessageOlderThan(id, config.backfillMaxAgeMs);
}

function isWg(msg: RawDiscordMessage): boolean {
  return isWgBotMessage(msg, config.wgBotDisplayName, config.wgBotAuthorId);
}

function watchedIds(): string[] {
  return [tradesChannelId, alertsChannelId, config.tradesChannelId, config.alertsChannelId].filter(Boolean);
}

/** Stable fingerprint of the parts we act on; changes when an edit adds content. */
function contentSignature(msg: RawDiscordMessage): string {
  const hasUnlock = isUnlockTeaser(msg) ? "1" : "0";
  return [msg.content, msg.embedTitle, msg.embedDescription, hasUnlock]
    .map((s) => s ?? "")
    .join("\u0001");
}

function isTradeJobQueued(id: string): boolean {
  return tradeQueue.some((j) => j.msg.id === id);
}

function removeUnlockJob(id: string): void {
  for (let i = tradeQueue.length - 1; i >= 0; i--) {
    if (tradeQueue[i].msg.id === id && tradeQueue[i].mode === "unlock") {
      tradeQueue.splice(i, 1);
    }
  }
}

function recordMessage(msg: RawDiscordMessage): void {
  const sig = contentSignature(msg);
  const prev = contentSeen.get(msg.id);
  if (prev !== undefined && prev === sig) return; // identical content already handled
  if (prev === undefined) stats.messagesSeen++;
  contentSeen.set(msg.id, sig);

  if (!isWatchedChannel(msg, watchedIds())) return;

  if (msg.channelId === alertsChannelId || msg.channelId === config.alertsChannelId) {
    if (!isWg(msg)) return;
    if (msg.source === "rest" && isTooOldForBackfill(msg.id)) {
      log.alert(`skip old alert (backfill): ${msg.id}`);
      return;
    }
    if (!looksLikeWgAlert(msg.content)) return;
    if (urgentQueue.some((m) => m.id === msg.id)) return;
    urgentQueue.push(msg);
    stats.alertsQueued++;
    log.alert(`queued: ${msg.content.slice(0, 120)}`);
    return;
  }

  if (msg.channelId !== tradesChannelId && msg.channelId !== config.tradesChannelId) return;
  if (!isWg(msg)) return;

  stats.wgMessages++;

  if (isUnlockTeaser(msg)) {
    if (shouldSkipUnlock(msg.id) || isTradeJobQueued(msg.id)) return;
    if (msg.source === "rest" && isTooOldForBackfill(msg.id)) {
      log.trade(`skip old teaser (backfill): ${msg.id}`);
      return;
    }
    const trader = teaserTrader(msg.content);
    if (!isFollowedTrader(trader)) {
      log.trade(`skip teaser @${trader || "?"}: ${msg.id}`);
      return;
    }
    tradeQueue.push({ msg, mode: "unlock", trader });
    stats.unlockQueued++;
    log.trade(`teaser queued: ${msg.id}`);
    return;
  }

  if (isDirectLimitSignal(msg)) {
    if (msg.source === "rest" && isTooOldForBackfill(msg.id)) {
      log.trade(`skip old direct signal (backfill): ${msg.id}`);
      return;
    }
    // A teaser that was edited into a full signal: drop the stale unlock job and
    // process the content we already have directly.
    removeUnlockJob(msg.id);
    if (isTradeJobQueued(msg.id)) return;
    const trader = teaserTrader(msg.content) || "";
    tradeQueue.push({ msg, mode: "direct", trader });
    stats.directQueued++;
    log.trade(`direct signal queued: ${msg.id}`);
  }
}

async function processSignal(
  msg: RawDiscordMessage,
  text: string,
  traderHint?: string,
): Promise<void> {
  const signal = parseLimitSignal(text, msg.id, config.defaultRiskPct);
  if (!signal) {
    log.warn("trade", `parse failed msg=${msg.id}`);
    return;
  }

  if (/\bstock\b/i.test(text)) {
    log.trade(`skip stock signal: ${signal.asset}`);
    return;
  }

  // The teaser tells us whose signal this is; prefer it over the @mention that
  // appears in the unlocked body (that mention is the clicker, e.g. @horesz86).
  if (traderHint && isFollowedTrader(traderHint)) {
    signal.trader = traderHint;
  }

  if (!isFollowedTrader(signal.trader)) {
    log.trade(`skip @${signal.trader || "?"} not in FOLLOWED_TRADERS`);
    return;
  }

  log.trade(`parsed ${signal.asset} ${signal.side} risk=${signal.riskPct}% @${signal.trader}`);
  await placeDcaTrade(signal, store);
}

/** Drain alerts fully. Never throws; one bad alert cannot wedge the pump. */
async function drainUrgent(): Promise<void> {
  while (urgentQueue.length > 0) {
    const msg = urgentQueue.shift()!;
    try {
      const alert = parseAlert(msg.content);
      if (!alert) {
        log.warn("urgent", `unparseable: ${msg.content.slice(0, 80)}`);
        continue;
      }
      alert.sourceMessageId = msg.id;
      log.alert(`execute ${alert.asset} @${alert.trader}: ${alert.actions.map((a) => a.type).join(", ")}`);
      await executeAlert(alert, store);
    } catch (err) {
      log.warn("urgent", `alert error ${msg.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** Drain trade jobs. Never throws; a failed job is isolated, not fatal. */
async function drainTrade(tradesPage: Page): Promise<void> {
  while (tradeQueue.length > 0) {
    const job = tradeQueue.shift()!;
    try {
      if (job.mode === "direct") {
        log.trade(`direct parse ${job.msg.id}`);
        await processSignal(job.msg, messageText(job.msg), job.trader);
        continue;
      }

      if (shouldSkipUnlock(job.msg.id)) {
        log.trade(`skip unlock (cooldown/cap): ${job.msg.id}`);
        continue;
      }

      log.trade(`unlocking ${job.msg.id}...`);
      let result;
      setUnlockInProgress(true);
      try {
        if (!config.discordKeepBackground) {
          await tradesPage.bringToFront();
        }
        if (tradesChannelId) {
          await ensureTradesPageOnChannel(tradesPage, tradesChannelId);
        }
        result = await unlockTeaser(tradesPage, job.msg, pendingInteractions);
      } catch (err) {
        recordUnlockFailure(job.msg.id, err instanceof Error ? err.message : String(err));
        continue;
      } finally {
        setUnlockInProgress(false);
        await scrollChannelToPresent(tradesPage).catch(() => {});
      }

      if (!result.success) {
        recordUnlockFailure(job.msg.id, result.error ?? "unknown");
        continue;
      }

      unlockSucceeded.add(job.msg.id);
      unlockHardFailures.delete(job.msg.id);
      unlockCooldownUntil.delete(job.msg.id);
      store.markUnlockDone(job.msg.id, { trader: job.trader });

      const unlocked = applyUnlocked(job.msg, {
        content: result.content,
        embedTitle: result.embedTitle,
        embedDescription: result.embedDescription,
        source: result.source ?? "interaction",
      });

      await processSignal(unlocked, messageText(unlocked), job.trader);
    } catch (err) {
      log.warn("trade", `trade job error ${job.msg.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

const queuePump = createQueuePump({
  isReady: () => watcherReady && tradesPageRef !== null,
  hasWork: () => urgentQueue.length > 0 || tradeQueue.length > 0,
  drainUrgent,
  drainTrade: () => drainTrade(tradesPageRef!),
});

function pumpQueues(): Promise<void> {
  return queuePump.pump();
}

function teaserTrader(content: string): string {
  return (
    extractTraderMention(content) ??
    (config.followedTraders.length === 1 ? config.followedTraders[0] : "")
  );
}

/**
 * Transient failures (button not found, detached node, navigation, timeout) get
 * a cooldown and are retried later by the DOM scan. Only a click that lands but
 * yields no content counts toward the hard cap.
 */
function recordUnlockFailure(messageId: string, error: string): void {
  unlockCooldownUntil.set(messageId, Date.now() + UNLOCK_COOLDOWN_MS);
  if (classifyUnlockError(error) === "hard") {
    const n = (unlockHardFailures.get(messageId) ?? 0) + 1;
    unlockHardFailures.set(messageId, n);
    log.warn("trade", `unlock failed (${n}/${MAX_UNLOCK_HARD_FAILURES}): ${error}`);
  } else {
    log.warn("trade", `unlock retry later (cooldown): ${error}`);
  }
}

function shouldSkipUnlock(messageId: string): boolean {
  if (unlockSucceeded.has(messageId)) return true;
  if ((unlockHardFailures.get(messageId) ?? 0) >= MAX_UNLOCK_HARD_FAILURES) return true;
  const until = unlockCooldownUntil.get(messageId);
  return until !== undefined && Date.now() < until;
}

async function queueDomUnlockTeasers(tradesPage: Page, channelId: string): Promise<void> {
  if (queuePump.isPumping() || isUnlockInProgress()) return;

  let teasers: RawDiscordMessage[] = [];
  try {
    teasers = await scanVisibleUnlockTeasers(tradesPage, channelId);
  } catch (err) {
    log.warn("trade", `dom scan failed: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const eligible = teasers
    .filter((msg) => {
      if (isMessageOlderThan(msg.id, MAX_DOM_UNLOCK_AGE_MS)) return false;
      if (shouldSkipUnlock(msg.id)) return false;
      if (isTradeJobQueued(msg.id)) return false;
      const trader = teaserTrader(msg.content);
      return isFollowedTrader(trader);
    })
    .sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));

  const msg = eligible[0];
  if (!msg) return;

  const trader = teaserTrader(msg.content);
  msg.authorId = config.wgBotAuthorId;
  contentSeen.set(msg.id, contentSignature(msg));
  tradeQueue.push({ msg, mode: "unlock", trader });
  stats.unlockQueued++;
  log.trade(`teaser queued (dom): ${msg.id}`);
}

async function ensureTradesPageOnChannel(tradesPage: Page, channelId: string): Promise<void> {
  if (!tradesPage.url().includes(channelId)) {
    await tradesPage.goto(channelUrl(channelId), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }
  await waitForTradesChannelReady(tradesPage, channelId);
}

function handleGatewayPayload(text: string): void {
  const event = parseGatewayEvent(text);
  if (!event || (event.type !== "MESSAGE_CREATE" && event.type !== "MESSAGE_UPDATE")) return;

  const msg = normalizeGatewayMessage(event.message, "gateway");
  if (!msg) return;

  stats.gatewayParsed++;
  recordMessage(msg);
  if (!watcherReady) return;
  void pumpQueues();
}

function attachPageGateway(page: Page): void {
  page.on("websocket", (ws) => {
    if (!ws.url().includes("gateway.discord")) return;

    ws.on("framereceived", ({ payload }: { payload: string | Buffer }) => {
      stats.gatewayFrames++;
      if (typeof payload !== "string") {
        // Discord negotiates zlib-stream compression on the web client, so most
        // frames arrive as binary and cannot be parsed as JSON. We rely on REST
        // + DOM scan for these; counted here for visibility.
        stats.gatewayBinary++;
        return;
      }
      handleGatewayPayload(payload);
    });
  });
}

async function handleRestResponse(response: Response): Promise<void> {
  const url = response.url();
  if (!/\/api\/v\d+\/channels\/\d+\/messages/.test(url)) return;
  if (response.status() !== 200) return;

  try {
    const body = await response.json();
    if (!Array.isArray(body)) return;
    const ch = url.match(/\/channels\/(\d+)\/messages/)?.[1];
    if (body.length > 0) {
      log.trade(`REST ${body.length} msgs${ch ? ` ch=${ch}` : ""}`);
    }
    for (const raw of body) {
      const msg = normalizeGatewayMessage(raw, "rest");
      if (!msg) continue;
      recordMessage(msg);
    }
    if (watcherReady) {
      void pumpQueues();
    }
  } catch {
    // ignore
  }
}

function attachRestListener(context: BrowserContext): void {
  const bind = (page: Page) => {
    page.on("response", (response) => void handleRestResponse(response));
  };

  for (const page of context.pages()) bind(page);
  context.on("page", bind);
}

async function resolveAlertsChannel(
  page: Page,
  getName: () => string,
  waitForChannelId?: (channelId: string) => Promise<string>,
): Promise<ChannelState | null> {
  const nav = await navigateToAlertsChannel(page, getName, waitForChannelId);
  if (!nav) return null;

  if (nav.channelId !== config.alertsChannelId) {
    await setEnvValue("DISCORD_ALERTS_CHANNEL_ID", nav.channelId);
    console.log(`  .env frissítve: DISCORD_ALERTS_CHANNEL_ID=${nav.channelId}`);
  }

  alertsChannelId = nav.channelId;
  return { channelId: nav.channelId, channelName: nav.channelName, page };
}

export async function runWatcher(): Promise<void> {
  if (!config.guildId) {
    throw new Error("Missing DISCORD_GUILD_ID");
  }
  if (!existsSync(config.profileDir)) {
    throw new Error(`No Discord session at ${config.profileDir} — run npm run discord:login`);
  }

  console.log("WG Discord watcher — dual channel");
  console.log(`DRY_RUN=${config.dryRun}`);
  console.log(`Trades: ${config.tradesChannelId || "(auto)"}`);
  console.log(`Alerts: ${config.alertsChannelId || "(auto)"}`);
  console.log(`Followed @mentions (#trades only): ${config.followedTraders.join(", ")}`);
  console.log(`Backfill depth: ${config.backfillMaxAgeDays} days`);
  console.log(`Chromium background: ${config.discordKeepBackground}\n`);

  loadPersistedUnlocks();

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      ...(config.discordKeepBackground ? ["--start-minimized"] : []),
    ],
  });

  const channelRegistry = attachChannelRegistry(context);
  const waitChannelName = (id: string) => channelRegistry.waitForName(id);

  const tradesPage = await context.newPage();
  const alertsPage = await context.newPage();
  tradesPageRef = tradesPage;

  attachInteractionCapture(tradesPage, (messageId, content) => {
    resolveInteractionPending(pendingInteractions, messageId, content);
  });

  attachRestListener(context);
  // One gateway listener is enough: the WebSocket delivers all guild events for
  // this user, so a second listener on the alerts tab only duplicates work.
  attachPageGateway(tradesPage);

  const tradesNav = await navigateToTradesChannel(
    tradesPage,
    () => channelRegistry.getName(tradesChannelId),
    waitChannelName,
  );
  if (tradesNav) {
    tradesChannelId = tradesNav.channelId;
    if (tradesNav.channelId !== config.tradesChannelId) {
      await setEnvValue("DISCORD_TRADES_CHANNEL_ID", tradesNav.channelId);
    }
    console.log(`Trades tab: #${tradesNav.channelName} (${tradesNav.channelId})`);
  } else if (config.tradesChannelId) {
    tradesChannelId = config.tradesChannelId;
    console.warn(`⚠️  #trades navigáció sikertelen — fallback .env ID: ${config.tradesChannelId}`);
  } else {
    console.warn("⚠️  #trades navigáció sikertelen — trade queue inaktív lehet");
  }

  const alertsNav = await resolveAlertsChannel(
    alertsPage,
    () => channelRegistry.getName(alertsChannelId),
    waitChannelName,
  );
  if (alertsNav) {
    console.log(`Alerts tab: #${alertsNav.channelName} (${alertsNav.channelId})`);
  } else if (config.tradesChannelId) {
    console.warn("⚠️  #active-alerts nem található — trade pipeline továbbra is fut");
  } else {
    console.warn("⚠️  #active-alerts navigáció sikertelen — futtasd: npm run discord:pick -- alerts");
  }

  if (tradesChannelId) {
    if (!config.discordKeepBackground) {
      await tradesPage.bringToFront();
    }
    await waitForTradesChannelReady(tradesPage, tradesChannelId);
    await backfillChannelMessages(tradesPage, tradesChannelId, true);
    await waitForTradesChannelReady(tradesPage, tradesChannelId);
    await queueDomUnlockTeasers(tradesPage, tradesChannelId);
  }
  if (alertsChannelId) {
    await backfillChannelMessages(alertsPage, alertsChannelId, true);
  }

  watcherReady = true;
  await pumpQueues();

  const queueInterval = setInterval(() => {
    void pumpQueues();
  }, 2_000);

  const heartbeat = setInterval(() => {
    console.log(
      `  … seen=${stats.messagesSeen} wg=${stats.wgMessages} unlock=${stats.unlockQueued} direct=${stats.directQueued} alerts=${stats.alertsQueued} pending=${tradeQueue.length}/${urgentQueue.length} gw=${stats.gatewayParsed}/${stats.gatewayFrames} (bin=${stats.gatewayBinary})`,
    );
  }, 60_000);

  const backfillInterval = setInterval(() => {
    // Skip while the pump is active: backfill scrolls the channel and would
    // detach the unlock buttons the trade pump is clicking.
    if (queuePump.isPumping() || isUnlockInProgress()) return;
    if (tradesChannelId) {
      void backfillChannelMessages(tradesPage, tradesChannelId);
    }
    if (alertsChannelId) {
      void backfillChannelMessages(alertsPage, alertsChannelId);
    }
  }, 5 * 60_000);

  const domScanInterval = setInterval(() => {
    if (!tradesChannelId) return;
    void queueDomUnlockTeasers(tradesPage, tradesChannelId).then(() => pumpQueues());
  }, 90_000);

  let stopped = false;
  const stop = () => {
    stopped = true;
    console.log("\nLeállítás...");
  };
  process.on("SIGINT", stop);
  context.on("close", stop);

  if (!tradesChannelId && !alertsChannelId) {
    console.error("\nNincs érvényes csatorna ID — futtasd:");
    console.error("  npm run discord:pick -- trades");
    console.error("  npm run discord:pick -- alerts\n");
    clearInterval(queueInterval);
    clearInterval(heartbeat);
    clearInterval(backfillInterval);
    clearInterval(domScanInterval);
    store.close();
    await context.close().catch(() => {});
    process.exit(1);
  }

  console.log("\nFigyelés aktív (Ctrl+C vagy böngésző bezárása = leállítás)");
  console.log("Ne zárd be a Chromium ablakot — minimalizáld.\n");

  while (!stopped) {
    try {
      await tradesPage.waitForTimeout(1_000);
    } catch {
      stopped = true;
      console.log("\nBöngésző bezárva — kilépés.");
    }
  }

  clearInterval(queueInterval);
  clearInterval(heartbeat);
  clearInterval(backfillInterval);
  clearInterval(domScanInterval);
  process.off("SIGINT", stop);
  store.close();
  await context.close().catch(() => {});
}
