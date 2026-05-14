"use client";

import Link from "next/link";
import type { TokenRank } from "@/lib/gmgn-client";
import { scoreToken, signalColor, signalLabel, formatPrice, formatMarketCap, formatVolume, formatPercent, timeAgo } from "@/lib/scoring";

export function TokenTable({ tokens, showInterval }: { tokens: TokenRank[]; showInterval?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs uppercase border-b border-brand-border">
            <th className="text-left py-2 px-2">#</th>
            <th className="text-left py-2 px-2">Token</th>
            <th className="text-right py-2 px-2">Price</th>
            <th className="text-right py-2 px-2">MCap</th>
            <th className="text-right py-2 px-2">Vol{showInterval ? ` (${showInterval})` : ""}</th>
            <th className="text-right py-2 px-2">1h</th>
            <th className="text-right py-2 px-2">Swaps</th>
            <th className="text-right py-2 px-2">Holders</th>
            <th className="text-right py-2 px-2">SM</th>
            <th className="text-right py-2 px-2">Rug</th>
            <th className="text-center py-2 px-2">Signal</th>
            <th className="text-right py-2 px-2">Age</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t, i) => {
            const signal = scoreToken(t);
            return (
              <tr
                key={t.address}
                className="border-b border-brand-border/50 hover:bg-white/[0.02] transition-colors"
              >
                <td className="py-2 px-2 text-gray-500">{i + 1}</td>
                <td className="py-2 px-2">
                  <Link
                    href={`/token/${t.address}`}
                    className="flex items-center gap-2 hover:text-brand-green transition-colors"
                  >
                    {t.logo && (
                      <img
                        src={t.logo}
                        alt=""
                        className="w-6 h-6 rounded-full bg-gray-800"
                        loading="lazy"
                      />
                    )}
                    <div>
                      <span className="font-medium">{t.symbol}</span>
                      {t.launchpad_platform && (
                        <span className="ml-1.5 text-[10px] text-gray-500 bg-gray-800 px-1 rounded">
                          {t.launchpad_platform}
                        </span>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">{formatPrice(t.price)}</td>
                <td className="py-2 px-2 text-right font-mono text-xs">{formatMarketCap(t.market_cap ?? (t as any).usd_market_cap)}</td>
                <td className="py-2 px-2 text-right font-mono text-xs">{formatVolume(t.volume ?? (t as any).volume_1h ?? 0)}</td>
                <td className={`py-2 px-2 text-right font-mono text-xs ${(t.price_change_percent1h ?? 0) >= 0 ? "text-brand-green" : "text-brand-red"}`}>
                  {formatPercent(t.price_change_percent1h ?? 0)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">
                  <span className="text-brand-green">{t.buys}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-brand-red">{t.sells}</span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">{t.holder_count}</td>
                <td className="py-2 px-2 text-right">
                  {t.smart_degen_count > 0 && (
                    <span className="text-xs font-bold text-brand-green">{t.smart_degen_count}</span>
                  )}
                  {t.renowned_count > 0 && (
                    <span className="text-xs text-purple-400 ml-1">+{t.renowned_count}K</span>
                  )}
                  {t.smart_degen_count === 0 && t.renowned_count === 0 && (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className={`py-2 px-2 text-right font-mono text-xs ${t.rug_ratio > 0.3 ? "text-brand-red" : t.rug_ratio > 0.1 ? "text-brand-yellow" : "text-gray-400"}`}>
                  {(t.rug_ratio * 100).toFixed(0)}%
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`text-xs font-bold ${signalColor(signal)}`}>
                    {signalLabel(signal)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right text-xs text-gray-500">
                  {t.creation_timestamp ? timeAgo(t.creation_timestamp) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
