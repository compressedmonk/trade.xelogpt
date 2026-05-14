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
        background: { color: "#0b0e14" },
        textColor: "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1a1f2e" },
        horzLines: { color: "#1a1f2e" },
      },
      crosshair: {
        vertLine: { color: "#4f46e5", width: 1, style: 2 },
        horzLine: { color: "#4f46e5", width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: "#1a1f2e",
      },
      timeScale: {
        borderColor: "#1a1f2e",
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
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
          color: parseFloat(b.close) >= parseFloat(b.open) ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
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
    <div className="bg-brand-card border border-brand-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-brand-border/30">
        <h2 className="text-sm font-bold text-gray-400 uppercase">Price Chart</h2>
        <div className="flex gap-1">
          {RESOLUTIONS.map((r) => (
            <button
              key={r}
              onClick={() => setResolution(r)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                resolution === r
                  ? "bg-indigo-600 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
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
            <span className="text-gray-500 text-sm animate-pulse">Loading chart...</span>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
