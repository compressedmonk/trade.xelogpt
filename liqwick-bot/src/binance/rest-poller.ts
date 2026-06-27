import type { BinanceFuturesClient } from "./client.js";
import type { WickMonitor } from "../strategy/wick-monitor.js";
import { log, logError } from "../util/logger.js";

export function startRestMarketPoller(
  client: BinanceFuturesClient,
  symbols: string[],
  monitor: WickMonitor,
  isWsHealthy: () => boolean,
  intervalMs = 2000,
): () => void {
  let warned = false;
  let active = false;

  const timer = setInterval(() => {
    void (async () => {
      if (isWsHealthy()) {
        if (active) {
          log("rest", "WS healthy — stopping REST fallback");
          active = false;
          warned = false;
        }
        return;
      }

      if (!warned) {
        log("rest", `WS unhealthy — polling market data every ${intervalMs}ms (fallback)`);
        warned = true;
        active = true;
      }

      for (const symbol of symbols) {
        try {
          const bars = await client.getKlines(symbol, "1m", 2);
          const bar = bars[bars.length - 1];
          if (!bar) continue;
          monitor.handleKline(symbol, bar);
          monitor.handleAggTrade(symbol, bar.close, Date.now());

          const premium = await client.getPremiumIndex(symbol);
          monitor.handleMarkPrice({
            symbol,
            markPrice: premium.markPrice,
            indexPrice: premium.indexPrice,
            fundingRate: premium.fundingRate,
            nextFundingTime: premium.nextFundingTime,
            timestamp: Date.now(),
          });
        } catch (err) {
          logError("rest", `${symbol} poll failed`, err);
        }
      }
    })();
  }, intervalMs);

  return () => clearInterval(timer);
}
