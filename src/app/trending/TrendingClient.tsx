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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Trending — Solana</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-brand-card rounded border border-brand-border">
            {INTERVALS.map((i) => (
              <button
                key={i.key}
                onClick={() => setInterval(i.key)}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  interval === i.key
                    ? "bg-brand-green/10 text-brand-green"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
          <select
            value={filterSignal}
            onChange={(e) => setFilterSignal(e.target.value as typeof filterSignal)}
            className="bg-brand-card border border-brand-border rounded px-2 py-1 text-sm text-gray-300"
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
