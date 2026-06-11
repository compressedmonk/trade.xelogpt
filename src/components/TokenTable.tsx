"use client";

import Link from "next/link";
import type { TokenRank } from "@/lib/gmgn-client";
import { scoreToken, signalColor, signalLabel, formatPrice, formatMarketCap, formatVolume, formatPercent, timeAgo } from "@/lib/scoring";

export function TokenTable({
  tokens,
  showInterval,
  customKolCounts,
  kolCountLabel = "KOL",
}: {
  tokens: TokenRank[];
  showInterval?: string;
  /** Saját KOL említések száma tokenenként (address lowercase) */
  customKolCounts?: Record<string, number>;
  kolCountLabel?: string;
}) {
  if (!tokens?.length) {
    return <p className="text-gray-500 text-center py-12">No tokens to display</p>;
  }
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase bg-white/[0.02]">
              <th className="text-left py-3 px-3">#</th>
              <th className="text-left py-3 px-3">Token</th>
              <th className="text-right py-3 px-3">Price</th>
              <th className="text-right py-3 px-3">MCap</th>
              <th className="text-right py-3 px-3">Vol{showInterval ? ` (${showInterval})` : ""}</th>
              <th className="text-right py-3 px-3">1h</th>
              <th className="text-right py-3 px-3">Swaps</th>
              <th className="text-right py-3 px-3">Holders</th>
              <th className="text-right py-3 px-3">{customKolCounts ? kolCountLabel : "SM"}</th>
              <th className="text-right py-3 px-3">Rug</th>
              <th className="text-center py-3 px-3">Signal</th>
              <th className="text-right py-3 px-3">Age</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t, i) => {
              const signal = scoreToken(t);
              return (
                <tr
                  key={t.address}
                  className="border-t border-white/[0.04] hover:bg-cyan-500/[0.03] transition-colors duration-150"
                >
                  <td className="py-2.5 px-3 text-gray-500">{i + 1}</td>
                  <td className="py-2.5 px-3">
                    <Link
                      href={`/token/${t.address}`}
                      className="flex items-center gap-2 hover:text-cyan-400 transition-colors"
                    >
                      {t.logo && (
                        <img
                          src={t.logo}
                          alt=""
                          className="w-6 h-6 rounded-full bg-white/[0.05] ring-1 ring-white/[0.08]"
                          loading="lazy"
                        />
                      )}
                      <div>
                        <span className="font-medium">{t.symbol}</span>
                        {t.launchpad_platform && (
                          <span className="ml-1.5 text-[10px] text-gray-500 bg-white/[0.06] px-1.5 py-0.5 rounded-md">
                            {t.launchpad_platform}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{formatPrice(t.price)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{formatMarketCap(t.market_cap ?? (t as any).usd_market_cap)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{formatVolume(t.volume ?? (t as any).volume_1h ?? 0)}</td>
                  <td className={`py-2.5 px-3 text-right font-mono text-xs ${(t.price_change_percent1h ?? 0) >= 0 ? "text-brand-green" : "text-brand-red"}`}>
                    {formatPercent(t.price_change_percent1h ?? 0)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">
                    <span className="text-brand-green">{t.buys}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-brand-red">{t.sells}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs">{t.holder_count}</td>
                  <td className="py-2.5 px-3 text-right">
                    {customKolCounts ? (
                      (customKolCounts[t.address.toLowerCase()] ?? 0) > 0 ? (
                        <span className="text-xs font-bold text-purple-400">
                          {customKolCounts[t.address.toLowerCase()]}K
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )
                    ) : (
                      <>
                        {t.smart_degen_count > 0 && (
                          <span className="text-xs font-bold text-cyan-400">{t.smart_degen_count}</span>
                        )}
                        {t.renowned_count > 0 && (
                          <span className="text-xs text-purple-400 ml-1">+{t.renowned_count}K</span>
                        )}
                        {t.smart_degen_count === 0 && t.renowned_count === 0 && (
                          <span className="text-gray-600">—</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className={`py-2.5 px-3 text-right font-mono text-xs ${t.rug_ratio > 0.3 ? "text-brand-red" : t.rug_ratio > 0.1 ? "text-brand-yellow" : "text-gray-400"}`}>
                    {(t.rug_ratio * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs font-bold ${signalColor(signal)}`}>
                      {signalLabel(signal)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-xs text-gray-500">
                    {t.creation_timestamp ? timeAgo(t.creation_timestamp) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
