"use client";

import { useState } from "react";
import type { TokenRank } from "@/lib/gmgn-client";
import { TokenTable } from "@/components/TokenTable";
import { scoreToken } from "@/lib/scoring";

const INTERVALS = [
  { key: "5m", label: "5m" },
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
] as const;

type IntervalKey = (typeof INTERVALS)[number]["key"];

export function TrendingClient({
  data1h,
  data5m,
  data24h,
}: {
  data1h: TokenRank[];
  data5m: TokenRank[];
  data24h: TokenRank[];
}) {
  const [interval, setInterval] = useState<IntervalKey>("1h");
  const [filterSignal, setFilterSignal] = useState<"all" | "pass" | "watch">("all");

  const dataMap: Record<IntervalKey, TokenRank[]> = { "5m": data5m, "1h": data1h, "24h": data24h };
  let tokens = dataMap[interval];

  if (filterSignal !== "all") {
    tokens = tokens.filter((t: TokenRank) => scoreToken(t) === filterSignal);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gradient">Trending — Solana</h1>
        <div className="flex items-center gap-3">
          <div className="flex glass rounded-lg overflow-hidden">
            {INTERVALS.map((i) => (
              <button
                key={i.key}
                onClick={() => setInterval(i.key)}
                className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                  interval === i.key
                    ? "bg-cyan-500/15 text-cyan-400 shadow-glow-sm"
                    : "text-gray-500 hover:text-cyan-300 hover:bg-white/[0.04]"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
          <select
            value={filterSignal}
            onChange={(e) => setFilterSignal(e.target.value as typeof filterSignal)}
            className="glass rounded-lg px-3 py-1.5 text-sm text-gray-300 outline-none focus:ring-1 focus:ring-cyan-500/30"
          >
            <option value="all">All Signals</option>
            <option value="pass">PASS only</option>
            <option value="watch">WATCH only</option>
          </select>
        </div>
      </div>
      <TokenTable tokens={tokens} showInterval={interval} />
    </div>
  );
}
