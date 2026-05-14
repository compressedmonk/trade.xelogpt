"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice, formatMarketCap, timeAgo } from "@/lib/scoring";

interface SmartTrade {
  transaction_hash?: string;
  maker: string;
  side: string;
  amount_usd: number;
  price_usd: number;
  timestamp: number;
  base_address: string;
  balance: number;
  base_token?: {
    symbol?: string;
    logo?: string;
    total_supply?: string;
    launchpad?: string;
  };
  maker_info?: {
    avatar?: string;
    name?: string;
    tags?: string[];
    twitter_username?: string;
    twitter_name?: string;
  };
}

export function SmartMoneyClient({ smartMoney, kols }: { smartMoney: unknown; kols: unknown }) {
  const [tab, setTab] = useState<"smart" | "kol">("smart");

  const rawSmart = smartMoney as { list?: SmartTrade[] } | SmartTrade[];
  const rawKol = kols as { list?: SmartTrade[] } | SmartTrade[];
  const smartList: SmartTrade[] = Array.isArray(rawSmart) ? rawSmart : (rawSmart?.list ?? []);
  const kolList: SmartTrade[] = Array.isArray(rawKol) ? rawKol : (rawKol?.list ?? []);
  const list = tab === "smart" ? smartList : kolList;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Smart Money Feed — Solana</h1>
        <div className="flex bg-brand-card rounded border border-brand-border">
          <button
            onClick={() => setTab("smart")}
            className={`px-3 py-1 text-sm font-medium transition-colors ${tab === "smart" ? "bg-brand-green/10 text-brand-green" : "text-gray-500"}`}
          >
            Smart Money ({smartList.length})
          </button>
          <button
            onClick={() => setTab("kol")}
            className={`px-3 py-1 text-sm font-medium transition-colors ${tab === "kol" ? "bg-purple-500/10 text-purple-400" : "text-gray-500"}`}
          >
            KOLs ({kolList.length})
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs uppercase border-b border-brand-border">
              <th className="text-left py-2 px-2">Time</th>
              <th className="text-left py-2 px-2">Wallet</th>
              <th className="text-center py-2 px-2">Side</th>
              <th className="text-left py-2 px-2">Token</th>
              <th className="text-right py-2 px-2">Amount</th>
              <th className="text-right py-2 px-2">Price</th>
              <th className="text-left py-2 px-2">Tags</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => (
              <tr key={t.transaction_hash ?? i} className="border-b border-brand-border/50 hover:bg-white/[0.02] transition-colors">
                <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">
                  {t.timestamp ? timeAgo(t.timestamp) : "—"}
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-gray-300">
                      {t.maker?.slice(0, 6)}...{t.maker?.slice(-4)}
                    </span>
                    {t.maker_info?.twitter_username && (
                      <a
                        href={`https://x.com/${t.maker_info.twitter_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 text-[10px] hover:underline"
                      >
                        @{t.maker_info.twitter_username}
                      </a>
                    )}
                    {t.maker_info?.name && (
                      <span className="text-gray-500 text-[10px]">{t.maker_info.name}</span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    t.side === "buy"
                      ? "bg-brand-green/10 text-brand-green"
                      : "bg-brand-red/10 text-brand-red"
                  }`}>
                    {t.side === "buy" ? "BUY" : "SELL"}
                  </span>
                </td>
                <td className="py-2 px-2">
                  <Link
                    href={`/token/${t.base_address}`}
                    className="flex items-center gap-1.5 hover:text-brand-green transition-colors"
                  >
                    {t.base_token?.logo && (
                      <img src={t.base_token.logo} alt="" className="w-5 h-5 rounded-full bg-gray-800" loading="lazy" />
                    )}
                    <span className="font-medium text-sm">{t.base_token?.symbol ?? t.base_address?.slice(0, 8)}</span>
                    {t.base_token?.launchpad && (
                      <span className="text-[10px] text-gray-600 bg-gray-800 px-1 rounded">{t.base_token.launchpad}</span>
                    )}
                  </Link>
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">
                  ${t.amount_usd?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2 px-2 text-right font-mono text-xs">
                  {formatPrice(t.price_usd)}
                </td>
                <td className="py-2 px-2">
                  <div className="flex gap-1">
                    {t.maker_info?.tags?.map((tag) => (
                      <span
                        key={tag}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          tag === "smart_degen"
                            ? "bg-brand-green/10 text-brand-green"
                            : tag === "renowned" || tag === "kol"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={7} className="text-center text-gray-500 py-8">No data available</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
