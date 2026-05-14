"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, type IChartApi } from "lightweight-charts";

interface KlineBar {
  time: number;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
}

const RESOLUTIONS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

export function KlineChart({ address }: { address: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [resolution, setResolution] = useState<string>("15m");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        vertLine: { color: "#06b6d4", width: 1, style: 2 },
        horzLine: { color: "#06b6d4", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
      },
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

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/kline?address=${address}&resolution=${resolution}`);
        const data = await res.json();
        const bars: KlineBar[] = data.list ?? data ?? [];

        if (!bars.length) {
          setLoading(false);
          return;
        }

        const candles = bars.map((b) => ({
          time: Math.floor(b.time / 1000) as any,
          open: parseFloat(b.open),
          high: parseFloat(b.high),
          low: parseFloat(b.low),
          close: parseFloat(b.close),
        }));

        const volumes = bars.map((b) => ({
          time: Math.floor(b.time / 1000) as any,
          value: parseFloat(b.volume),
          color: parseFloat(b.close) >= parseFloat(b.open) ? "rgba(6,182,212,0.2)" : "rgba(248,113,113,0.2)",
        }));

        candleSeries.setData(candles);
        volumeSeries.setData(volumes);
        chart.timeScale().fitContent();
      } catch (e) {
        console.error("Kline fetch error:", e);
      }
      setLoading(false);
    }

    loadData();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [address, resolution]);

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Price Chart</h2>
        <div className="flex gap-1">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setResolution(r)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all duration-200 ${
                resolution === r
                  ? "bg-cyan-500/15 text-cyan-400 shadow-glow-sm"
                  : "text-gray-500 hover:text-cyan-300 hover:bg-white/[0.04]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="relative" style={{ height: 400 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-cyan-400/60 text-sm animate-pulse">Loading chart...</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
