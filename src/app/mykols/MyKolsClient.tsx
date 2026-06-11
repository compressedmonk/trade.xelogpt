"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice, timeAgo } from "@/lib/scoring";

interface KolWallet {
  id: number;
  walletAddress: string;
  label: string | null;
  chain: string;
}

interface KolProfile {
  id: number;
  twitterUsername: string;
  displayName: string | null;
  enabled: boolean;
  wallets: KolWallet[];
}

interface FeedItem {
  id: string;
  type: "mention" | "buy" | "sell";
  timestamp: number;
  twitterUsername: string;
  displayName: string | null;
  walletAddress?: string;
  walletLabel?: string | null;
  tokenAddress?: string;
  tokenSymbol?: string;
  amountUsd?: number;
  detail?: string;
  cluster: boolean;
  clusterCount?: number;
}

export function MyKolsClient() {
  const [profiles, setProfiles] = useState<KolProfile[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newWallet, setNewWallet] = useState("");
  const [status, setStatus] = useState("");

  const fetchProfiles = useCallback(async () => {
    const res = await fetch("/api/kols");
    const data = await res.json();
    setProfiles(Array.isArray(data) ? data : []);
  }, []);

  const fetchFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const res = await fetch("/api/kols/feed?limit=50");
      const data = await res.json();
      setFeed(Array.isArray(data) ? data : []);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProfiles(), fetchFeed()]);
    setLoading(false);
  }, [fetchProfiles, fetchFeed]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchFeed, 60000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchFeed]);

  async function addKol() {
    if (!newHandle.trim()) return;
    setStatus("Hozzáadás...");
    await fetch("/api/kols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        twitterUsername: newHandle.trim(),
        wallets: newWallet.trim() ? [newWallet.trim()] : [],
        autoResolve: !newWallet.trim(),
      }),
    });
    setNewHandle("");
    setNewWallet("");
    setStatus("");
    fetchAll();
  }

  async function resolveWallet(profile: KolProfile) {
    setStatus(`@${profile.twitterUsername} wallet feloldás...`);
    const res = await fetch("/api/kols/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitterUsername: profile.twitterUsername }),
    });
    const data = await res.json();
    if (data.walletAddress) {
      await fetch("/api/kols", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: profile.id, addWallet: data.walletAddress, label: "main" }),
      });
      setStatus(`Wallet megtalálva: ${data.walletAddress.slice(0, 8)}...`);
    } else {
      setStatus("Nem található wallet a GMGN-ben — add meg manuálisan.");
    }
    fetchAll();
  }

  async function toggleEnabled(profile: KolProfile) {
    await fetch("/api/kols", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: profile.id, enabled: !profile.enabled }),
    });
    fetchProfiles();
  }

  async function deleteKol(id: number) {
    await fetch("/api/kols", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  }

  async function removeWallet(walletId: number) {
    const profile = profiles.find((p) => p.wallets.some((w) => w.id === walletId));
    if (!profile) return;
    await fetch("/api/kols", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: profile.id, removeWalletId: walletId }),
    });
    fetchProfiles();
  }

  const typeLabel = (t: FeedItem["type"]) =>
    t === "mention" ? "EMLÍTÉS" : t === "buy" ? "BUY" : "SELL";

  const typeColor = (t: FeedItem["type"]) =>
    t === "mention" ? "text-purple-400" : t === "buy" ? "text-brand-green" : "text-brand-red";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gradient mb-1">Saját KOL-ok</h1>
        <p className="text-sm text-gray-500">
          Csak a te általad kiválasztott X fiókok említései és wallet vásárlásai.
        </p>
      </div>

      {/* Add KOL */}
      <div className="glass rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">KOL hozzáadása</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="@username"
            className="flex-1 min-w-[140px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600"
          />
          <input
            value={newWallet}
            onChange={(e) => setNewWallet(e.target.value)}
            placeholder="Wallet cím (opcionális)"
            className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600"
          />
          <button
            onClick={addKol}
            className="px-4 py-2 bg-purple-500/20 text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-500/30 transition-colors"
          >
            Hozzáadás
          </button>
        </div>
        {status && <p className="text-xs text-gray-400">{status}</p>}
      </div>

      {/* KOL list */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">
            KOL lista ({profiles.length})
          </h2>
        </div>
        {loading ? (
          <p className="p-4 text-gray-500 text-sm">Betöltés...</p>
        ) : profiles.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">Még nincs KOL. Adj hozzá egy @handle-t fent.</p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {profiles.map((p) => (
              <div key={p.id} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://x.com/${p.twitterUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 font-medium hover:underline"
                    >
                      @{p.twitterUsername}
                    </a>
                    {p.displayName && <span className="text-xs text-gray-500">{p.displayName}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.enabled ? "bg-brand-green/10 text-brand-green" : "bg-white/[0.06] text-gray-500"}`}>
                      {p.enabled ? "AKTÍV" : "SZÜNET"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {p.wallets.length === 0 && (
                      <button onClick={() => resolveWallet(p)} className="text-xs text-purple-400 hover:text-purple-300">
                        Wallet feloldás
                      </button>
                    )}
                    <button onClick={() => toggleEnabled(p)} className="text-xs text-gray-400 hover:text-gray-300">
                      {p.enabled ? "Szünet" : "Aktiválás"}
                    </button>
                    <button onClick={() => deleteKol(p.id)} className="text-xs text-brand-red hover:text-red-300">
                      Törlés
                    </button>
                  </div>
                </div>
                {p.wallets.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {p.wallets.map((w) => (
                      <div key={w.id} className="flex items-center gap-2 text-xs font-mono text-gray-400">
                        <span className="text-purple-400/70">{w.label ?? "wallet"}</span>
                        <span>{w.walletAddress.slice(0, 8)}...{w.walletAddress.slice(-4)}</span>
                        <button onClick={() => removeWallet(w.id)} className="text-brand-red/70 hover:text-brand-red">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Feed</h2>
          <button
            onClick={fetchFeed}
            disabled={feedLoading}
            className="text-xs text-gray-400 hover:text-cyan-400 disabled:opacity-50"
          >
            {feedLoading ? "Frissítés..." : "Frissítés"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-white/[0.06]">
                <th className="text-left px-4 py-2">Idő</th>
                <th className="text-left px-4 py-2">KOL</th>
                <th className="text-left px-4 py-2">Típus</th>
                <th className="text-left px-4 py-2">Token</th>
                <th className="text-left px-4 py-2">Részlet</th>
                <th className="text-left px-4 py-2">Jel</th>
              </tr>
            </thead>
            <tbody>
              {feed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nincs esemény. Adj hozzá KOL-okat és várj az említésekre / vásárlásokra.
                  </td>
                </tr>
              ) : (
                feed.map((item) => (
                  <tr key={item.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{timeAgo(item.timestamp)}</td>
                    <td className="px-4 py-2">
                      <a
                        href={`https://x.com/${item.twitterUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline"
                      >
                        @{item.twitterUsername}
                      </a>
                    </td>
                    <td className={`px-4 py-2 font-bold text-xs ${typeColor(item.type)}`}>
                      {typeLabel(item.type)}
                    </td>
                    <td className="px-4 py-2">
                      {item.tokenAddress ? (
                        <Link href={`/token/${item.tokenAddress}`} className="text-cyan-400 hover:underline">
                          {item.tokenSymbol ?? item.tokenAddress.slice(0, 6)}
                        </Link>
                      ) : item.tokenSymbol ? (
                        <span className="text-gray-300">${item.tokenSymbol}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-400 max-w-[200px] truncate text-xs">
                      {item.type === "mention"
                        ? item.detail
                        : item.amountUsd
                          ? formatPrice(item.amountUsd)
                          : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {item.cluster && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-bold">
                          CLUSTER{item.clusterCount ? ` ×${item.clusterCount}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
