"use client";

import { useState } from "react";
import { TokenTable } from "@/components/TokenTable";
import type { TokenRank } from "@/lib/gmgn-client";

const TABS = [
  { key: "new", label: "New", emoji: "🆕" },
  { key: "near", label: "Almost Bonded", emoji: "⏳" },
  { key: "completed", label: "Graduated", emoji: "✅" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function TrenchesClient({
  newCreation,
  nearCompletion,
  completed,
}: {
  newCreation: unknown[];
  nearCompletion: unknown[];
  completed: unknown[];
}) {
  const [tab, setTab] = useState<TabKey>("new");

  const dataMap: Record<TabKey, TokenRank[]> = {
    new: newCreation as TokenRank[],
    near: nearCompletion as TokenRank[],
    completed: completed as TokenRank[],
  };

  const tokens = dataMap[tab];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gradient">Trenches — New Tokens</h1>
        <div className="flex glass rounded-lg overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                tab === t.key
                  ? "bg-cyan-500/15 text-cyan-400 shadow-glow-sm"
                  : "text-gray-500 hover:text-cyan-300 hover:bg-white/[0.04]"
              }`}
            >
              {t.emoji} {t.label}
              <span className="ml-1 text-xs text-gray-600">
                ({(dataMap[t.key] ?? []).length})
              </span>
            </button>
          ))}
        </div>
      </div>
      {tokens.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No tokens in this category</p>
      ) : (
        <TokenTable tokens={tokens} />
      )}
    </div>
  );
}
