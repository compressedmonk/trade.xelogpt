import { BinanceFuturesClient } from "./binance/client.js";
import { startRestMarketPoller } from "./binance/rest-poller.js";
import { BinanceStreamHub } from "./binance/websocket.js";
import { config } from "./config.js";
import { startDashboard } from "./dashboard/server.js";
import { BotStore } from "./db/store.js";
import { detectRegime, regimeLabel } from "./regime/detector.js";
import { WickMonitor } from "./strategy/wick-monitor.js";
import { PositionManager } from "./executor/position-manager.js";
import { log, logError } from "./util/logger.js";

async function refreshRegime(client: BinanceFuturesClient, store: BotStore, monitor: WickMonitor): Promise<void> {
  try {
    const bars = await client.getKlines(config.regimeSymbol, config.regimeTimeframe, 260);
    const closes = bars.map((b) => b.close);
    const regime = detectRegime(closes, config.regimeEmaPeriod, config.regimeEmaSlopeBars);
    monitor.setRegime(regime);
    log("regime", `${config.regimeSymbol} ${config.regimeTimeframe} → ${regimeLabel(regime)}`);
  } catch (err) {
    logError("regime", "refresh failed", err);
    store.logEvent(null, "regime_error", { error: String(err) });
  }
}

async function bootstrapSymbols(client: BinanceFuturesClient, monitor: WickMonitor): Promise<void> {
  for (const symbol of config.symbolWhitelist) {
    const bars = await client.getKlines(symbol, "1m", 120);
    await monitor.seedHistory(symbol, bars);
    log("boot", `${symbol} seeded ${bars.length} 1m bars + levels`);
  }
}

async function main(): Promise<void> {
  log("liqwick", "starting LiqWick Bot v2 (confluence + forceOrder + funding/basis + journal)");
  log("liqwick", `symbols=${config.symbolWhitelist.join(",")} DRY_RUN=${config.dryRun} TESTNET=${config.binanceTestnet} JOURNAL=${config.journalEnabled}`);

  const store = new BotStore();
  const client = new BinanceFuturesClient();
  const monitor = new WickMonitor(config.symbolWhitelist, store, client, (signal) => {
    log("signal", `${signal.side.toUpperCase()} ${signal.symbol} score=${signal.score.total} @ ${signal.entryPrice}`);
  });

  await bootstrapSymbols(client, monitor);
  await refreshRegime(client, store, monitor);

  const hub = new BinanceStreamHub(
    config.symbolWhitelist,
    (u) => monitor.handleKline(u.symbol, u.bar),
    (u) => monitor.handleAggTrade(u.symbol, u.price, u.timestamp),
    (u) => monitor.handleForceOrder(u),
    (u) => monitor.handleMarkPrice(u),
  );
  hub.start();
  startRestMarketPoller(client, config.symbolWhitelist, monitor, () => hub.isHealthy(), 2000);

  setInterval(() => {
    void refreshRegime(client, store, monitor);
  }, config.regimePollMs);

  setInterval(() => {
    for (const symbol of config.symbolWhitelist) {
      void monitor.refreshLevels(symbol);
    }
  }, config.levelsRefreshMs);

  const positionManager = new PositionManager(store);
  setInterval(() => {
    void positionManager.tick();
  }, 5000);

  startDashboard(store, () => {
    const lastAt = hub.getLastMessageAt();
    const healthy = hub.isHealthy();
    return store.getStatus(
      config.symbolWhitelist,
      monitor.getSnapshots(),
      monitor.getCircuitStats(),
      {
        wsConnected: hub.isConnected(),
        wsLastMessageAt: lastAt,
        dataSource: healthy ? "ws" : "rest",
        wsLastMessageAgeMs: lastAt ? Date.now() - lastAt : null,
      },
    );
  });

  process.on("SIGINT", () => {
    log("liqwick", "shutting down");
    hub.stop();
    store.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logError("liqwick", "fatal", err);
  process.exit(1);
});
