"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Position {
  id: number;
  mint: string;
  symbol: string;
  name: string;
  qty: number;
  costSol: number;
  buyPriceSol: number | null;
  buyPriceUsd: number | null;
  priceUsd: number | null;
  priceSol: number | null;
  valueUsd: number | null;
  valueSol: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  marketCapUsd: number | null;
  sweepTx: string | null;
  buyTx: string | null;
  createdAt: string;
  dexUrl: string | null;
}

interface WalletCard {
  id: "primary" | "extra";
  label: string;
  address: string;
  balanceSol: number | null;
  spendableSol: number | null;
  reserveSol: number;
  buyLabel: string;
  buyPerTriggerSol: number | null;
}

interface WatchProfile {
  userId: string;
  label: string;
  tag: "primary" | "extra";
  buyMode: "full" | "fraction";
  buyFraction: number | null;
  buyLabel: string;
  walletId: "primary" | "extra";
}

interface RecentBuy {
  discordMsgId: string;
  mint: string;
  authorId: string;
  authorLabel: string;
  profileTag: "primary" | "extra" | null;
  status: string;
  solSpent: number;
  reason: string | null;
  latencyMs: number | null;
  txSignature: string | null;
  createdAt: string;
}

interface Dashboard {
  configured: boolean;
  dryRun: boolean;
  destWallet: string;
  wallets: WalletCard[];
  watchProfiles: WatchProfile[];
  portfolioValueUsd: number;
  positions: Position[];
  recentBuys: RecentBuy[];
  buyStats: { total: number; bought: number; error: number; skipped: number };
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n < 0.0001 && n > 0) return n.toExponential(2);
  return n.toFixed(digits);
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${fmt(n, 2)}`;
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function tagBadge(tag: "primary" | "extra") {
  return tag === "primary" ? (
    <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide bg-cyan-500/15 text-cyan-300">primary</span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide bg-violet-500/15 text-violet-300">extra</span>
  );
}

export function DegenClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/degen/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const primaryWallet = data?.wallets.find((w) => w.id === "primary");
  const extraWallet = data?.wallets.find((w) => w.id === "extra");

  if (loading && !data) {
    return <div className="p-8 text-gray-400 animate-pulse">Degen dashboard betöltése…</div>;
  }

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl glass-strong p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-500/80 mb-2 font-mono">Degen Sniper</p>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient text-glow mb-2">Bot Dashboard</h1>
          <p className="text-gray-400 text-sm max-w-xl">
            Két bot tárca (primary + extra), követett Discord userek, sweepelt tokenek a dest tárcán — 30 mp-enként frissül.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${data?.dryRun ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {data?.dryRun ? "DRY RUN" : "LIVE"}
            </span>
            {!data?.configured && (
              <span className="px-2.5 py-1 rounded-full text-xs bg-red-500/15 text-red-300">DB nincs csatlakoztatva</span>
            )}
            {data?.buyStats && (
              <span className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-gray-400">
                {data.buyStats.bought} vétel · {data.buyStats.error} hiba · {data.buyStats.skipped} skip
              </span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="glass rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Bot wallets */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5 glass-hover">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm text-gray-500 uppercase tracking-wide">Primary tárca</h2>
            {tagBadge("primary")}
          </div>
          <p className="text-3xl font-bold text-cyan-300">{fmt(primaryWallet?.balanceSol ?? null, 4)} SOL</p>
          <p className="text-sm text-gray-400 mt-1">
            Vásárlásra: <span className="text-gray-200">{fmt(primaryWallet?.spendableSol ?? null, 4)} SOL</span>
            <span className="text-gray-600"> (reserve {primaryWallet?.reserveSol ?? "—"} SOL)</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Trigger: <span className="text-gray-300">{primaryWallet?.buyLabel ?? "full spendable"}</span>
            {primaryWallet?.buyPerTriggerSol != null && (
              <span className="text-gray-400"> · ~{fmt(primaryWallet.buyPerTriggerSol, 4)} SOL</span>
            )}
          </p>
          {primaryWallet?.address && (
            <p className="text-xs font-mono text-gray-500 mt-3 break-all">{primaryWallet.address}</p>
          )}
        </div>

        <div className="glass rounded-xl p-5 glass-hover">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm text-gray-500 uppercase tracking-wide">Extra tárca (shared)</h2>
            {tagBadge("extra")}
          </div>
          {extraWallet ? (
            <>
              <p className="text-3xl font-bold text-violet-300">{fmt(extraWallet.balanceSol ?? null, 4)} SOL</p>
              <p className="text-sm text-gray-400 mt-1">
                Vásárlásra: <span className="text-gray-200">{fmt(extraWallet.spendableSol ?? null, 4)} SOL</span>
                <span className="text-gray-600"> (reserve {extraWallet.reserveSol} SOL)</span>
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Trigger: <span className="text-gray-300">{extraWallet.buyLabel}</span>
                {extraWallet.buyPerTriggerSol != null && (
                  <span className="text-gray-400"> · ~{fmt(extraWallet.buyPerTriggerSol, 4)} SOL / user</span>
                )}
              </p>
              {extraWallet.address ? (
                <p className="text-xs font-mono text-gray-500 mt-3 break-all">{extraWallet.address}</p>
              ) : (
                <p className="text-xs text-amber-400/80 mt-3">DEGEN_EXTRA_BOT_WALLET nincs beállítva</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Extra tier nincs konfigurálva.</p>
          )}
        </div>
      </div>

      {/* Watch profiles + portfolio */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="font-semibold text-gray-200">Követett userek</h2>
            <p className="text-xs text-gray-500 mt-1">{data?.watchProfiles.length ?? 0} profil</p>
          </div>
          {data?.watchProfiles.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Nincs watch profil (DEGEN_WATCH_USER_ID / DEGEN_EXTRA_WATCH).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-white/[0.04]">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Tier</th>
                    <th className="px-4 py-3 font-medium">Tárca</th>
                    <th className="px-4 py-3 font-medium">Buy rule</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.watchProfiles.map((p) => (
                    <tr key={p.userId} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-100">{p.label}</div>
                        <div className="text-xs font-mono text-gray-500">{p.userId}</div>
                      </td>
                      <td className="px-4 py-3">{tagBadge(p.tag)}</td>
                      <td className="px-4 py-3 text-gray-400 capitalize">{p.walletId}</td>
                      <td className="px-4 py-3 text-gray-300">{p.buyLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="glass rounded-xl p-5 glass-hover">
          <h2 className="text-sm text-gray-500 uppercase tracking-wide mb-3">Portfólió (dest tárca)</h2>
          <p className="text-3xl font-bold text-gradient">{fmtUsd(data?.portfolioValueUsd)}</p>
          <p className="text-sm text-gray-400 mt-1">{data?.positions.length ?? 0} sweepelt pozíció</p>
          {data?.destWallet && (
            <p className="text-xs font-mono text-gray-500 mt-3 break-all">{data.destWallet}</p>
          )}
        </div>
      </div>

      {/* Positions */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="font-semibold text-gray-200">Sweepelt tokenek</h2>
          <button type="button" onClick={() => load()} className="text-xs text-cyan-400 hover:text-cyan-300">
            Frissítés
          </button>
        </div>
        {data?.positions.length === 0 ? (
          <p className="p-8 text-center text-gray-500 text-sm">Még nincs sweepelt token a naplóban.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/[0.04]">
                  <th className="px-4 py-3 font-medium">Token</th>
                  <th className="px-4 py-3 font-medium">Mennyiség</th>
                  <th className="px-4 py-3 font-medium">Vétel (SOL)</th>
                  <th className="px-4 py-3 font-medium">Vétel ár</th>
                  <th className="px-4 py-3 font-medium">Most</th>
                  <th className="px-4 py-3 font-medium">Érték</th>
                  <th className="px-4 py-3 font-medium">PnL</th>
                  <th className="px-4 py-3 font-medium">Idő</th>
                </tr>
              </thead>
              <tbody>
                {data?.positions.map((p) => (
                  <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-100">{p.symbol}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[140px]">{p.name}</div>
                      <Link href={`/token/${p.mint}`} className="text-xs text-cyan-500/80 hover:text-cyan-400">
                        {short(p.mint)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-300">{fmt(p.qty, 2)}</td>
                    <td className="px-4 py-3 font-mono">{fmt(p.costSol, 4)}</td>
                    <td className="px-4 py-3">
                      <div>{fmtUsd(p.buyPriceUsd)}</div>
                      <div className="text-xs text-gray-500">{fmt(p.buyPriceSol, 8)} SOL</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{fmtUsd(p.priceUsd)}</div>
                      <div className="text-xs text-gray-500">{fmt(p.priceSol, 8)} SOL</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{fmtUsd(p.valueUsd)}</td>
                    <td className="px-4 py-3">
                      <span className={p.pnlUsd != null && p.pnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmtUsd(p.pnlUsd)}
                        {p.pnlPct != null && <span className="text-xs ml-1">({fmt(p.pnlPct, 1)}%)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(p.createdAt + "Z").toLocaleString("hu-HU")}
                      <div className="flex gap-2 mt-1">
                        {p.buyTx && (
                          <a href={`https://solscan.io/tx/${p.buyTx}`} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400">
                            buy
                          </a>
                        )}
                        {p.sweepTx && (
                          <a href={`https://solscan.io/tx/${p.sweepTx}`} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400">
                            sweep
                          </a>
                        )}
                        {p.dexUrl && (
                          <a href={p.dexUrl} target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-400">
                            dex
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent buys */}
      {data && data.recentBuys.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h2 className="font-semibold text-gray-200">Legutóbbi triggerek</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/[0.04]">
                  <th className="px-4 py-3 font-medium">Státusz</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Mint</th>
                  <th className="px-4 py-3 font-medium">SOL</th>
                  <th className="px-4 py-3 font-medium">Latency</th>
                  <th className="px-4 py-3 font-medium">Idő</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBuys.slice(0, 15).map((b) => (
                  <tr key={b.discordMsgId ?? `${b.mint}-${b.createdAt}`} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <span className={`font-medium ${b.status === "bought" ? "text-emerald-400" : b.status === "error" ? "text-red-400" : "text-gray-300"}`}>
                        {b.status}
                      </span>
                      {b.reason && <div className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate">{b.reason}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-200">{b.authorLabel}</div>
                      {b.profileTag && <div className="mt-0.5">{tagBadge(b.profileTag)}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400">
                      {short(b.mint)}
                      {b.txSignature && (
                        <a href={`https://solscan.io/tx/${b.txSignature}`} target="_blank" rel="noreferrer" className="block text-xs text-cyan-600 hover:text-cyan-400 mt-0.5">
                          tx
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">{fmt(b.solSpent, 4)}</td>
                    <td className="px-4 py-3 text-gray-500">{b.latencyMs != null ? `${b.latencyMs} ms` : "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(b.createdAt + "Z").toLocaleString("hu-HU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
