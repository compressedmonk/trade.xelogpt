"use client";

import { useState } from "react";

export function SmartMoneyClient({ smartMoney, kols }: { smartMoney: any; kols: any }) {
  const [tab, setTab] = useState<"smart" | "kol">("smart");
  const list: any[] = tab === "smart"
    ? (smartMoney?.list ?? smartMoney ?? [])
    : (kols?.list ?? kols ?? []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Smart Money — Solana</h1>
        <div className="flex bg-brand-card rounded border border-brand-border">
          <button
            onClick={() => setTab("smart")}
            className={`px-3 py-1 text-sm font-medium transition-colors ${tab === "smart" ? "bg-brand-green/10 text-brand-green" : "text-gray-500"}`}
          >
            Smart Money
          </button>
          <button
            onClick={() => setTab("kol")}
            className={`px-3 py-1 text-sm font-medium transition-colors ${tab === "kol" ? "bg-purple-500/10 text-purple-400" : "text-gray-500"}`}
          >
            KOLs
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase border-b border-brand-border">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Wallet</th>
              <th className="text-left py-2 px-2">Name</th>
              <th className="text-right py-2 px-2">PnL (7d)</th>
              <th className="text-right py-2 px-2">Win Rate</th>
              <th className="text-right py-2 px-2">Trades</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(list) && list.map((w: any, i: number) => (
              <tr key={w.address ?? i} className="border-b border-brand-border/50 hover:bg-white/[0.02]">
                <td className="py-2 px-2 text-gray-500">{i + 1}</td>
                <td className="py-2 px-2 font-mono text-xs">
                  {w.address?.slice(0, 6)}...{w.address?.slice(-4)}
                </td>
                <td className="py-2 px-2">
                  {w.twitter_username && (
                    <a href={`https://x.com/${w.twitter_username}`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-400 hover:underline text-xs">@{w.twitter_username}</a>
                  )}
                  {w.name && <span className="text-gray-300 text-xs ml-1">{w.name}</span>}
                </td>
                <td className={`py-2 px-2 text-right font-mono text-xs ${(w.pnl_7d ?? w.realized_profit ?? 0) >= 0 ? "text-brand-green" : "text-brand-red"}`}>
                  ${((w.pnl_7d ?? w.realized_profit ?? 0) / 1).toFixed(0)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">
                  {w.win_rate != null ? `${(w.win_rate * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">
                  {w.total_trades ?? w.buy_count ?? "—"}
                </td>
              </tr>
            ))}
            {(!Array.isArray(list) || list.length === 0) && (
              <tr><td colSpan={6} className="text-center text-gray-500 py-8">No data available</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
