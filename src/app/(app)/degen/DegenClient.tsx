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

interface Dashboard {
  configured: boolean;
  dryRun: boolean;
  botWallet: string;
  destWallet: string;
  balance: { sol: number | null; spendableSol: number | null; reserveSol: number };
  portfolioValueUsd: number;
  positions: Position[];
  recentBuys: { discordMsgId: string; mint: string; status: string; solSpent: number; createdAt: string; txSignature: string | null }[];
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

  if (loading && !data) {
    return <div className="p-8 text-gray-400 animate-pulse">Degen dashboard betöltése…</div>;
  }

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Hero — landing-style */}
      <div className="relative overflow-hidden rounded-2xl glass-strong p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-500/80 mb-2 font-mono">Degen Sniper</p>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient text-glow mb-2">Bot Dashboard</h1>
          <p className="text-gray-400 text-sm max-w-xl">
            Bot tárca egyenleg, sweepelt tokenek a saját tárcádon — árak DexScreener-ről, 30 mp-enként frissül.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${data?.dryRun ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {data?.dryRun ? "DRY RUN" : "LIVE"}
            </span>
            {!data?.configured && (
              <span className="px-2.5 py-1 rounded-full text-xs bg-red-500/15 text-red-300">DB nincs csatlakoztatva</span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="glass rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Wallet cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5 glass-hover">
          <h2 className="text-sm text-gray-500 uppercase tracking-wide mb-3">Bot tárca (SOL)</h2>
          <p className="text-3xl font-bold text-cyan-300">{fmt(data?.balance.sol ?? null, 4)} SOL</p>
          <p className="text-sm text-gray-400 mt-1">
            Vásárlásra: <span className="text-gray-200">{fmt(data?.balance.spendableSol ?? null, 4)} SOL</span>
            <span className="text-gray-600"> (reserve {data?.balance.reserveSol} SOL)</span>
          </p>
          {data?.botWallet && (
            <p className="text-xs font-mono text-gray-500 mt-3 break-all">{data.botWallet}</p>
          )}
        </div>
        <div className="glass rounded-xl p-5 glass-hover">
          <h2 className="text-sm text-gray-500 uppercase tracking-wide mb-3">Portfólió (saját tárca)</h2>
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
        <div className="glass rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-3">Legutóbbi triggerek</h2>
          <ul className="space-y-2 text-sm">
            {data.recentBuys.slice(0, 10).map((b) => (
              <li key={b.discordMsgId ?? `${b.mint}-${b.createdAt}`} className="flex flex-wrap gap-x-3 gap-y-1 text-gray-400">
                <span className={`font-medium ${b.status === "bought" ? "text-emerald-400" : b.status === "error" ? "text-red-400" : "text-gray-300"}`}>
                  {b.status}
                </span>
                <span className="font-mono text-gray-500">{short(b.mint)}</span>
                <span>{fmt(b.solSpent, 4)} SOL</span>
                <span className="text-gray-600">{new Date(b.createdAt + "Z").toLocaleString("hu-HU")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
