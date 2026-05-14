"use client";

import { formatPrice, formatMarketCap } from "@/lib/scoring";

function SecurityBadge({ label, safe, warning, danger }: { label: string; safe?: boolean; warning?: boolean; danger?: boolean }) {
  let color = "text-gray-500";
  let icon = "—";
  if (safe) { color = "text-brand-green"; icon = "✅"; }
  if (warning) { color = "text-brand-yellow"; icon = "⚠️"; }
  if (danger) { color = "text-brand-red"; icon = "🚫"; }

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-brand-border/30">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`text-sm font-medium ${color}`}>{icon}</span>
    </div>
  );
}

export function TokenDetail({
  address,
  info,
  security,
  holders,
}: {
  address: string;
  info: any;
  security: any;
  holders: any;
}) {
  if (!info) {
    return <p className="text-center text-gray-500 py-12">Token not found or API error</p>;
  }

  const price = info.price ?? 0;
  const mcap = (info.price ?? 0) * (info.circulating_supply ?? info.total_supply ?? 0);
  const holderList = holders?.list ?? holders ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {info.logo && <img src={info.logo} alt="" className="w-12 h-12 rounded-full bg-gray-800" />}
        <div>
          <h1 className="text-2xl font-bold">{info.symbol ?? "?"}</h1>
          <p className="text-sm text-gray-500">{info.name}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-2xl font-bold font-mono">{formatPrice(price)}</p>
          <p className="text-sm text-gray-500">MCap: {formatMarketCap(mcap)}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCard label="Liquidity" value={formatMarketCap(info.liquidity ?? 0)} />
        <InfoCard label="Holders" value={String(info.holder_count ?? "—")} />
        <InfoCard label="Smart Money" value={String(info.wallet_tags_stat?.smart_wallets ?? "—")} />
        <InfoCard label="KOLs" value={String(info.wallet_tags_stat?.renowned_wallets ?? "—")} />
      </div>

      {/* Social links */}
      <div className="flex gap-3 text-sm">
        {info.link?.twitter_username && (
          <a href={`https://x.com/${info.link.twitter_username}`} target="_blank" rel="noopener noreferrer"
            className="text-blue-400 hover:underline">@{info.link.twitter_username}</a>
        )}
        {info.link?.website && (
          <a href={info.link.website} target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:underline">{info.link.website}</a>
        )}
        {info.link?.telegram && (
          <a href={info.link.telegram} target="_blank" rel="noopener noreferrer"
            className="text-blue-300 hover:underline">Telegram</a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Security scorecard */}
        {security && (
          <div className="bg-brand-card border border-brand-border rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase mb-3">Security Audit</h2>
            <SecurityBadge label="Honeypot" safe={security.is_honeypot === "no" || security.is_honeypot === 0} danger={security.is_honeypot === "yes" || security.is_honeypot === 1} />
            <SecurityBadge label="Contract Verified" safe={security.open_source === "yes"} warning={security.open_source === "unknown"} danger={security.open_source === "no"} />
            <SecurityBadge label="Owner Renounced" safe={security.owner_renounced === "yes"} danger={security.owner_renounced === "no"} />
            <SecurityBadge label="Mint Renounced" safe={!!security.renounced_mint} danger={!security.renounced_mint} />
            <SecurityBadge label="Freeze Renounced" safe={!!security.renounced_freeze_account} danger={!security.renounced_freeze_account} />
            <SecurityBadge
              label={`Rug Ratio: ${((security.rug_ratio ?? 0) * 100).toFixed(0)}%`}
              safe={(security.rug_ratio ?? 0) < 0.1}
              warning={(security.rug_ratio ?? 0) >= 0.1 && (security.rug_ratio ?? 0) <= 0.3}
              danger={(security.rug_ratio ?? 0) > 0.3}
            />
            <SecurityBadge
              label={`Top 10 Holders: ${((security.top_10_holder_rate ?? 0) * 100).toFixed(0)}%`}
              safe={(security.top_10_holder_rate ?? 0) < 0.2}
              warning={(security.top_10_holder_rate ?? 0) >= 0.2 && (security.top_10_holder_rate ?? 0) <= 0.5}
              danger={(security.top_10_holder_rate ?? 0) > 0.5}
            />
            <SecurityBadge
              label={`Dev Status: ${security.creator_token_status ?? "unknown"}`}
              safe={security.creator_token_status === "creator_close"}
              danger={security.creator_token_status === "creator_hold"}
            />
          </div>
        )}

        {/* Smart money holders */}
        <div className="bg-brand-card border border-brand-border rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase mb-3">Smart Money Holders</h2>
          {Array.isArray(holderList) && holderList.length > 0 ? (
            <div className="space-y-2">
              {holderList.slice(0, 10).map((h: any, i: number) => (
                <div key={h.address ?? i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 font-mono text-xs">
                    {h.address?.slice(0, 4)}...{h.address?.slice(-4)}
                  </span>
                  <span className="text-gray-300">
                    {((h.amount_percentage ?? 0) * 100).toFixed(2)}%
                  </span>
                  <span className={h.profit >= 0 ? "text-brand-green" : "text-brand-red"}>
                    {h.profit != null ? `$${h.profit.toFixed(0)}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm">No smart money holders found</p>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="text-xs text-gray-600 font-mono break-all">
        CA: {address}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-card border border-brand-border rounded-lg p-3">
      <p className="text-xs text-gray-500 uppercase">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
    </div>
  );
}
