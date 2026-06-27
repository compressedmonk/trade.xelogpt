"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";

function binanceFuturesUrl(symbol: string): string {
  return `https://www.binance.com/en/futures/${symbol}`;
}

interface AphaTrade {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  leverage: number;
  outcome: "profit" | "be" | "sl";
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  priceMovePct: number;
  pnlPct: number;
  pnlUsdt: number;
  marginUsdt: number;
  dayIndex: number;
}

interface AphaStats {
  totalTrades: number;
  winRate: number;
  beRate: number;
  slRate: number;
  profitRate: number;
  avgPnlPct: number;
  totalPnlUsdt: number;
  avgLeverage: number;
  startingCapitalUsdt: number;
  roiPct: number;
}

interface Dashboard {
  trades: AphaTrade[];
  stats: AphaStats;
  symbols: string[];
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(digits);
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function outcomeBadge(outcome: AphaTrade["outcome"]) {
  if (outcome === "profit") {
    return <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-emerald-500/15 text-emerald-300">TP</span>;
  }
  if (outcome === "be") {
    return <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-gray-500/15 text-gray-300">BE</span>;
  }
  return <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-red-500/15 text-red-300">SL</span>;
}

function sideBadge(side: AphaTrade["side"]) {
  return side === "LONG" ? (
    <span className="text-emerald-400 font-medium">{side}</span>
  ) : (
    <span className="text-red-400 font-medium">{side}</span>
  );
}

function TradeChart({ trade }: { trade: AphaTrade }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#6b7280", fontSize: 11 },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        vertLine: { color: "#06b6d4", width: 1, style: 2 },
        horzLine: { color: "#06b6d4", width: 1, style: 2 },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: true },
      autoSize: true,
    });

    chartRef.current = chart;
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#06b6d4",
      downColor: "#f87171",
      borderUpColor: "#06b6d4",
      borderDownColor: "#f87171",
      wickUpColor: "#06b6d4",
      wickDownColor: "#f87171",
    });

    async function load() {
      setLoading(true);
      try {
        const pad = 12 * 60 * 60 * 1000;
        const start = trade.entryTime - pad;
        const end = trade.exitTime + pad;
        const res = await fetch(
          `/api/apha/klines?symbol=${trade.symbol}&startTime=${start}&endTime=${end}&interval=1h`,
        );
        const data = await res.json();
        const bars = data.list ?? [];

        const candles = bars.map((b: { time: number; open: string; high: string; low: string; close: string }) => ({
          time: Math.floor(b.time / 1000) as UTCTimestamp,
          open: parseFloat(b.open),
          high: parseFloat(b.high),
          low: parseFloat(b.low),
          close: parseFloat(b.close),
        }));

        candleSeries.setData(candles);

        candleSeries.setMarkers([
          {
            time: Math.floor(trade.entryTime / 1000) as UTCTimestamp,
            position: trade.side === "LONG" ? "belowBar" : "aboveBar",
            color: "#06b6d4",
            shape: trade.side === "LONG" ? "arrowUp" : "arrowDown",
            text: "Entry",
          },
          {
            time: Math.floor(trade.exitTime / 1000) as UTCTimestamp,
            position: trade.outcome === "sl" ? "aboveBar" : "belowBar",
            color: trade.outcome === "sl" ? "#f87171" : "#34d399",
            shape: "circle",
            text: trade.outcome === "be" ? "BE" : trade.outcome === "sl" ? "SL" : "TP",
          },
        ]);

        chart.timeScale().fitContent();
      } catch (e) {
        console.error("Chart load error:", e);
      }
      setLoading(false);
    }

    load();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [trade]);

  return (
    <div className="relative" style={{ height: 320 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-cyan-400/60 text-sm animate-pulse">Chart betöltése…</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

export function AphaClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AphaTrade | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const qs = symbolFilter ? `?symbol=${encodeURIComponent(symbolFilter)}` : "";
      const res = await fetch(`/api/apha/trades${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [symbolFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data?.trades.length) {
      setSelected(data.trades[0]);
    } else {
      setSelected(null);
    }
  }, [data, symbolFilter]);

  const filteredSymbols = (data?.symbols ?? []).filter((s) =>
    s.toLowerCase().includes(search.toLowerCase()),
  );

  const stats = data?.stats;

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl glass-strong p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-emerald-600/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-500/80 mb-2 font-mono">Binance Futures</p>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient text-glow mb-2">apha_bot</h1>
          <p className="text-gray-400 text-sm max-w-2xl">
            Automatizált perpetual futures bot — valós piaci adatokon alapuló trade napló, 2026. április 12. óta.
            Minden pozíció lezárt; entry és exit árak Binance gyertyákon ellenőrizhetők.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300">
              LIVE
            </span>
            <span className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-gray-400">
              USDT-M Perpetual · 3–6x leverage · $600/trade margin
            </span>
            {stats && (
              <span className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-gray-400">
                {stats.totalTrades} lezárt trade
              </span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="glass rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "Kezdőtőke", value: `$${fmt(stats.startingCapitalUsdt, 0)}`, accent: "text-gray-200" },
            { label: "ROI", value: `${fmt(stats.roiPct, 1)}%`, accent: stats.roiPct >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Win rate", value: `${fmt(stats.winRate, 1)}%`, accent: "text-emerald-400" },
            { label: "TP rate", value: `${fmt(stats.profitRate, 1)}%`, accent: "text-cyan-400" },
            { label: "BE rate", value: `${fmt(stats.beRate, 1)}%`, accent: "text-gray-300" },
            { label: "SL rate", value: `${fmt(stats.slRate, 1)}%`, accent: "text-red-400" },
            { label: "Avg PnL", value: `${fmt(stats.avgPnlPct, 2)}%`, accent: stats.avgPnlPct >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Total PnL", value: `$${fmt(stats.totalPnlUsdt, 0)}`, accent: stats.totalPnlUsdt >= 0 ? "text-emerald-400" : "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="glass rounded-xl p-4 glass-hover">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.accent}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 glass rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-200">Pár szűrő</h2>
          <input
            type="text"
            placeholder="Keresés (pl. BTCUSDT)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/40"
          />
          <button
            type="button"
            onClick={() => setSymbolFilter("")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !symbolFilter ? "bg-cyan-500/10 text-cyan-400" : "text-gray-400 hover:bg-white/[0.04]"
            }`}
          >
            Összes pár
          </button>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {filteredSymbols.slice(0, 80).map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbolFilter(sym)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                  symbolFilter === sym ? "bg-cyan-500/10 text-cyan-400" : "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 glass rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="font-semibold text-gray-200">Trade napló</h2>
            <button type="button" onClick={() => load()} className="text-xs text-cyan-400 hover:text-cyan-300">
              Frissítés
            </button>
          </div>
          {loading && !data ? (
            <p className="p-8 text-center text-gray-500 animate-pulse">Napló betöltése…</p>
          ) : !data?.trades.length ? (
            <p className="p-8 text-center text-gray-500 text-sm">Még nincs lezárt trade ebben a szűrőben.</p>
          ) : (
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0f14]/95 backdrop-blur">
                  <tr className="text-left text-gray-500 border-b border-white/[0.04]">
                    <th className="px-4 py-3 font-medium">Pár</th>
                    <th className="px-4 py-3 font-medium">Oldal</th>
                    <th className="px-4 py-3 font-medium">Lev.</th>
                    <th className="px-4 py-3 font-medium">Margin</th>
                    <th className="px-4 py-3 font-medium">Entry</th>
                    <th className="px-4 py-3 font-medium">Exit</th>
                    <th className="px-4 py-3 font-medium">Eredmény</th>
                    <th className="px-4 py-3 font-medium">PnL</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className={`border-b border-white/[0.03] cursor-pointer transition-colors ${
                        selected?.id === t.id ? "bg-cyan-500/5" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-gray-200">{t.symbol.replace("USDT", "")}</td>
                      <td className="px-4 py-3">{sideBadge(t.side)}</td>
                      <td className="px-4 py-3 text-gray-400">{t.leverage}x</td>
                      <td className="px-4 py-3 font-mono text-gray-400">${fmt(t.marginUsdt, 0)}</td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-gray-300">{fmtPrice(t.entryPrice)}</div>
                        <div className="text-[10px] text-gray-600">
                          {new Date(t.entryTime).toLocaleString("hu-HU")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-gray-300">{fmtPrice(t.exitPrice)}</div>
                        <div className="text-[10px] text-gray-600">
                          {new Date(t.exitTime).toLocaleString("hu-HU")}
                        </div>
                      </td>
                      <td className="px-4 py-3">{outcomeBadge(t.outcome)}</td>
                      <td className="px-4 py-3">
                        <span className={t.pnlUsdt >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {t.pnlUsdt >= 0 ? "+" : ""}${fmt(t.pnlUsdt, 2)}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">({fmt(t.pnlPct, 1)}%)</span>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={binanceFuturesUrl(t.symbol)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-cyan-600 hover:text-cyan-400"
                        >
                          Binance ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex flex-wrap items-center gap-3">
            <h2 className="font-semibold text-gray-200">
              {selected.symbol} · {selected.side} · {selected.leverage}x
            </h2>
            {outcomeBadge(selected.outcome)}
            <span className={`text-sm ${selected.pnlUsdt >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {selected.pnlUsdt >= 0 ? "+" : ""}${fmt(selected.pnlUsdt, 2)} ({fmt(selected.pnlPct, 1)}%)
            </span>
            <a
              href={binanceFuturesUrl(selected.symbol)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-cyan-400 hover:text-cyan-300"
            >
              Megnyitás Binance-en ↗
            </a>
          </div>
          <TradeChart trade={selected} />
        </div>
      )}
    </div>
  );
}
