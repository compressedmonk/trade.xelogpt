"use client";

import { formatPrice, formatMarketCap, timeAgo } from "@/lib/scoring";
import { KlineChart } from "@/components/KlineChart";

function SecurityBadge({ label, safe, warning, danger }: { label: string; safe?: boolean; warning?: boolean; danger?: boolean }) {
  let color = "text-gray-500";
  let dot = "bg-gray-600";
  if (safe) { color = "text-brand-green"; dot = "bg-brand-green shadow-[0_0_6px_rgba(52,211,153,0.5)]"; }
  if (warning) { color = "text-brand-yellow"; dot = "bg-brand-yellow shadow-[0_0_6px_rgba(251,191,36,0.5)]"; }
  if (danger) { color = "text-brand-red"; dot = "bg-brand-red shadow-[0_0_6px_rgba(248,113,113,0.5)]"; }

  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
    </div>
  );
}

const SIGNAL_NAMES: Record<number, string> = {
  1: "Price Spike",
  6: "Price Up",
  7: "ATH",
  11: "CTO",
  12: "SM Buy",
  13: "Platform Call",
};

const SIGNAL_COLORS: Record<number, string> = {
  6: "text-brand-green",
  7: "text-brand-yellow",
  11: "text-purple-400",
  12: "text-cyan-400",
  13: "text-blue-400",
};

export function TokenDetail({
  address,
  info,
  security,
  holders,
  signals,
}: {
  address: string;
  info: any;
  security: any;
  holders: any;
  signals: any;
}) {
  if (!info) {
    return <p className="text-center text-gray-500 py-12">Token not found or API error</p>;
  }

  const priceNum = typeof info.price === "object" ? parseFloat(info.price?.price ?? "0") : Number(info.price ?? 0);
  const supply = parseFloat(info.circulating_supply ?? info.total_supply ?? "0");
  const mcap = priceNum * supply;
  const liq = parseFloat(info.liquidity ?? "0");
  const holderList = holders?.list ?? holders ?? [];
  const signalList: any[] = Array.isArray(signals) ? signals : (signals?.list ?? []);
  const tokenSignals = signalList.filter((s: any) => s.token_address === address).slice(0, 10);

  const dev = info.dev ?? {};
  const link = info.link ?? {};
  const stat = info.stat ?? {};
  const walletTags = info.wallet_tags_stat ?? {};

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6 flex items-center gap-5">
        {info.logo && <img src={info.logo} alt="" className="w-14 h-14 rounded-full ring-2 ring-white/[0.08] bg-white/[0.05]" />}
        <div>
          <h1 className="text-2xl font-bold text-gradient">{info.symbol ?? "?"}</h1>
          <p className="text-sm text-gray-500">{info.name}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-2xl font-bold font-mono text-white">{formatPrice(priceNum)}</p>
          <p className="text-sm text-gray-500">MCap: {formatMarketCap(mcap)}</p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <InfoCard label="Liquidity" value={formatMarketCap(liq)} />
        <InfoCard label="Holders" value={String(info.holder_count ?? "—")} />
        <InfoCard label="Smart Money" value={String(walletTags.smart_wallets ?? "—")} accent="cyan" />
        <InfoCard label="KOLs" value={String(walletTags.renowned_wallets ?? "—")} accent="purple" />
        <InfoCard label="Snipers" value={String(walletTags.sniper_wallets ?? "—")} accent="red" />
      </div>

      {/* K-line Chart */}
      <KlineChart address={address} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Security scorecard */}
        {security && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-cyan-500/5 to-transparent">
              <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Security Audit</h2>
            </div>
            <div className="p-4">
              <SecurityBadge label="Honeypot" safe={security.is_honeypot === "no" || security.is_honeypot === 0} danger={security.is_honeypot === "yes" || security.is_honeypot === 1} />
              <SecurityBadge label="Contract Verified" safe={security.open_source === "yes"} warning={security.open_source === "unknown"} danger={security.open_source === "no"} />
              <SecurityBadge label="Owner Renounced" safe={security.owner_renounced === "yes"} danger={security.owner_renounced === "no"} />
              <SecurityBadge label="Mint Renounced" safe={!!security.renounced_mint} danger={!security.renounced_mint} />
              <SecurityBadge label="Freeze Renounced" safe={!!security.renounced_freeze_account} danger={!security.renounced_freeze_account} />
              <SecurityBadge
                label={`Rug Ratio: ${(parseFloat(security.rug_ratio ?? "0") * 100).toFixed(0)}%`}
                safe={parseFloat(security.rug_ratio ?? "0") < 0.1}
                warning={parseFloat(security.rug_ratio ?? "0") >= 0.1 && parseFloat(security.rug_ratio ?? "0") <= 0.3}
                danger={parseFloat(security.rug_ratio ?? "0") > 0.3}
              />
              <SecurityBadge
                label={`Top 10: ${(parseFloat(security.top_10_holder_rate ?? "0") * 100).toFixed(0)}%`}
                safe={parseFloat(security.top_10_holder_rate ?? "0") < 0.2}
                warning={parseFloat(security.top_10_holder_rate ?? "0") >= 0.2 && parseFloat(security.top_10_holder_rate ?? "0") <= 0.5}
                danger={parseFloat(security.top_10_holder_rate ?? "0") > 0.5}
              />
              <SecurityBadge
                label={`Dev: ${security.creator_token_status ?? "unknown"}`}
                safe={security.creator_token_status === "creator_close"}
                danger={security.creator_token_status === "creator_hold"}
              />
            </div>
          </div>
        )}

        {/* Social & Dev Info */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-blue-500/5 to-transparent">
            <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Social & Dev</h2>
          </div>
          <div className="p-4">
            {/* Social links */}
            <div className="space-y-2 mb-4">
              {link.twitter_username && (
                <SocialRow
                  icon="𝕏"
                  label={`@${link.twitter_username}`}
                  href={`https://x.com/${link.twitter_username}`}
                  badge={info.x_user_follower ? `${formatFollowers(info.x_user_follower)} followers` : undefined}
                />
              )}
              {link.website && (
                <SocialRow icon="🌐" label={truncateUrl(link.website)} href={link.website} />
              )}
              {link.telegram && (
                <SocialRow icon="✈️" label="Telegram" href={link.telegram} />
              )}
              {link.discord && (
                <SocialRow icon="💬" label="Discord" href={link.discord} />
              )}
              {!link.twitter_username && !link.website && !link.telegram && (
                <p className="text-gray-600 text-sm">No social links</p>
              )}
            </div>

            {/* Dev intelligence */}
            <div className="border-t border-white/[0.04] pt-3 space-y-1.5">
              <DevRow label="Dev tokens created" value={dev.creator_open_count} warn={dev.creator_open_count > 10} />
              <DevRow label="Twitter renames" value={dev.twitter_rename_count} warn={dev.twitter_rename_count > 0} />
              <DevRow label="Deleted tweets" value={dev.twitter_del_post_token_count} warn={dev.twitter_del_post_token_count > 0} />
              <DevRow label="Tokens promoted on X" value={dev.twitter_create_token_count} warn={dev.twitter_create_token_count > 3} />
              {dev.cto_flag === 1 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-purple-400 font-medium">CTO</span>
                  <span className="text-gray-500">Community Takeover</span>
                </div>
              )}
            </div>

            {/* DexScreener marketing */}
            {(dev.dexscr_ad || dev.dexscr_update_link || dev.dexscr_trending_bar || dev.dexscr_boost_fee) && (
              <div className="border-t border-white/[0.04] pt-3 mt-3">
                <p className="text-xs text-gray-500 uppercase mb-1.5">DexScreener</p>
                <div className="flex flex-wrap gap-1.5">
                  {dev.dexscr_ad === 1 && <DexBadge label="Ad" />}
                  {dev.dexscr_update_link === 1 && <DexBadge label="Links Updated" />}
                  {dev.dexscr_trending_bar === 1 && <DexBadge label="Trending" />}
                  {dev.dexscr_boost_fee > 0 && <DexBadge label="Boosted" />}
                </div>
              </div>
            )}

            {/* Risk ratios */}
            <div className="border-t border-white/[0.04] pt-3 mt-3 space-y-1.5">
              <RiskBar label="Insider traders" value={parseFloat(stat.top_rat_trader_percentage ?? "0")} />
              <RiskBar label="Bundler bots" value={parseFloat(stat.top_bundler_trader_percentage ?? "0")} />
              <RiskBar label="Fresh wallets" value={parseFloat(stat.fresh_wallet_rate ?? "0")} />
              <RiskBar label="Bot degens" value={parseFloat(stat.bot_degen_rate ?? "0")} />
            </div>
          </div>
        </div>

        {/* Smart money holders */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-cyan-500/5 to-transparent">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Smart Money Holders</h2>
          </div>
          <div className="p-4">
            {Array.isArray(holderList) && holderList.length > 0 ? (
              <div className="space-y-2">
                {holderList.slice(0, 10).map((h: any, i: number) => (
                  <div key={h.address ?? i} className="flex items-center justify-between text-sm py-1 border-b border-white/[0.03] last:border-0">
                    <span className="text-gray-400 font-mono text-xs">
                      {h.address?.slice(0, 4)}...{h.address?.slice(-4)}
                    </span>
                    <span className="text-gray-300">
                      {((h.amount_percentage ?? 0) * 100).toFixed(2)}%
                    </span>
                    <span className={Number(h.profit ?? 0) >= 0 ? "text-brand-green" : "text-brand-red"}>
                      {h.profit != null ? `$${Number(h.profit).toFixed(0)}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600 text-sm">No smart money holders found</p>
            )}
          </div>
        </div>
      </div>

      {/* Signal Feed */}
      {tokenSignals.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-r from-purple-500/5 to-transparent">
            <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Recent Signals</h2>
          </div>
          <div className="p-4 space-y-2">
            {tokenSignals.map((s: any, i: number) => (
              <div key={s.id ?? i} className="flex items-center gap-3 text-sm">
                <span className="text-gray-500 text-xs w-12">{s.trigger_at ? timeAgo(s.trigger_at) : "—"}</span>
                <span className={`font-medium text-xs px-2 py-0.5 rounded-md ${SIGNAL_COLORS[s.signal_type] ?? "text-gray-400"} bg-white/[0.04]`}>
                  {SIGNAL_NAMES[s.signal_type] ?? `Signal #${s.signal_type}`}
                </span>
                <span className="text-gray-400 text-xs">
                  MCap at trigger: {formatMarketCap(s.trigger_mc)}
                </span>
                {s.signal_times > 1 && (
                  <span className="text-gray-600 text-xs">x{s.signal_times}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Address */}
      <div className="text-xs text-gray-600 font-mono break-all px-1">
        CA: {address}
      </div>
    </div>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: "cyan" | "purple" | "red" }) {
  const accentClass = accent === "cyan" ? "text-cyan-400" : accent === "purple" ? "text-purple-400" : accent === "red" ? "text-brand-red" : "";
  return (
    <div className="glass glass-hover rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold font-mono mt-1 ${accentClass}`}>{value}</p>
    </div>
  );
}

function SocialRow({ icon, label, href, badge }: { icon: string; label: string; href: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm w-5 text-center">{icon}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-400 hover:text-cyan-300 hover:underline truncate transition-colors">
        {label}
      </a>
      {badge && <span className="text-[10px] text-gray-500 bg-white/[0.06] px-1.5 py-0.5 rounded-md ml-auto">{badge}</span>}
    </div>
  );
}

function DevRow({ label, value, warn }: { label: string; value: number | undefined; warn?: boolean }) {
  if (value == null || value === 0) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={warn ? "text-brand-yellow font-medium" : "text-gray-300"}>{value}</span>
    </div>
  );
}

function DexBadge({ label }: { label: string }) {
  return <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400">{label}</span>;
}

function RiskBar({ label, value }: { label: string; value: number }) {
  if (value === 0) return null;
  const pct = Math.min(value * 100, 100);
  const color = pct > 30 ? "bg-brand-red" : pct > 10 ? "bg-brand-yellow" : "bg-cyan-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-white/[0.04] rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url.slice(0, 30);
  }
}
