"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { TokenRank } from "@/lib/gmgn-client";
import { TokenTable } from "@/components/TokenTable";
import { formatPrice, formatFollowers, timeAgo } from "@/lib/scoring";
import type { KolCategory } from "@/lib/solana-kol-seed";
import type { KolSource } from "@/lib/kol-discovery";

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

interface KolTokenRow {
  token: TokenRank;
  myKolCount: number;
  myKols: string[];
  lastMentionAt: number;
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

interface DiscoveredKol {
  twitterUsername: string;
  displayName: string | null;
  category: KolCategory | null;
  followerCount: number | null;
  followerSource: "live" | "approx" | null;
  notes: string | null;
  sources: KolSource[];
  walletAddress: string | null;
  alreadyAdded: boolean;
}

const CATEGORY_LABELS: Record<KolCategory, string> = {
  builder: "Builder",
  trader: "Trader",
  news: "News",
  memecoin: "Memecoin",
  community: "Community",
};

const SOURCE_LABELS: Record<KolSource, string> = {
  seed: "Seed",
  wallet_seed: "Tárca",
  gmgn_kol: "GMGN KOL",
  gmgn_smartmoney: "GMGN SM",
};

interface WalletSeedKol {
  walletAddress: string;
  displayName: string;
  twitterUsername: string;
  alreadyAdded: boolean;
}

export function MyKolsClient() {
  const [profiles, setProfiles] = useState<KolProfile[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [kolTokens, setKolTokens] = useState<KolTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredKol[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverCategory, setDiscoverCategory] = useState<KolCategory | "">("");
  const [discoverMinFollowers, setDiscoverMinFollowers] = useState("");
  const [discoverGmgnOnly, setDiscoverGmgnOnly] = useState(false);
  const [discoverWalletOnly, setDiscoverWalletOnly] = useState(false);
  const [walletSeed, setWalletSeed] = useState<WalletSeedKol[]>([]);
  const [walletSeedLoading, setWalletSeedLoading] = useState(false);
  const [importingWallets, setImportingWallets] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"wallets" | "discover">("wallets");
  const [newHandle, setNewHandle] = useState("");
  const [newWallet, setNewWallet] = useState("");
  const [status, setStatus] = useState("");

  const fetchProfiles = useCallback(async () => {
    const res = await fetch("/api/kols");
    if (!res.ok) {
      setStatus("Hiba: KOL lista nem tölthető be (szerver hiba).");
      setProfiles([]);
      return;
    }
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

  const fetchKolTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const res = await fetch("/api/kols/tokens");
      const data = await res.json();
      setKolTokens(Array.isArray(data) ? data : []);
    } finally {
      setTokensLoading(false);
    }
  }, []);

  const fetchDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    try {
      const params = new URLSearchParams();
      if (discoverCategory) params.set("category", discoverCategory);
      if (discoverMinFollowers) params.set("minFollowers", discoverMinFollowers);
      if (discoverGmgnOnly) params.set("gmgnOnly", "true");
      if (discoverWalletOnly) params.set("walletSeedOnly", "true");
      const res = await fetch(`/api/kols/discover?${params.toString()}`);
      const data = await res.json();
      setDiscovered(Array.isArray(data.kols) ? data.kols : []);
    } finally {
      setDiscoverLoading(false);
    }
  }, [discoverCategory, discoverMinFollowers, discoverGmgnOnly, discoverWalletOnly]);

  const fetchWalletSeed = useCallback(async () => {
    setWalletSeedLoading(true);
    try {
      const res = await fetch("/api/kols/wallet-seed");
      const data = await res.json();
      setWalletSeed(Array.isArray(data.kols) ? data.kols : []);
    } finally {
      setWalletSeedLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const tasks: Promise<void>[] = [fetchProfiles(), fetchFeed(), fetchKolTokens()];
    if (importOpen) {
      tasks.push(fetchDiscover(), fetchWalletSeed());
    }
    await Promise.all(tasks);
    setLoading(false);
  }, [fetchProfiles, fetchFeed, fetchKolTokens, fetchDiscover, fetchWalletSeed, importOpen]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProfiles(), fetchFeed(), fetchKolTokens()]).finally(() => setLoading(false));
    const interval = setInterval(() => {
      fetchFeed();
      fetchKolTokens();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchProfiles, fetchFeed, fetchKolTokens]);

  useEffect(() => {
    if (!importOpen) return;
    fetchWalletSeed();
    fetchDiscover();
  }, [importOpen, fetchWalletSeed, fetchDiscover]);

  const customKolCounts = Object.fromEntries(
    kolTokens.map((r) => [r.token.address.toLowerCase(), r.myKolCount]),
  );
  const tableTokens: TokenRank[] = kolTokens.map((r) => ({
    ...r.token,
    renowned_count: Math.max(r.token.renowned_count ?? 0, r.myKolCount),
  }));

  async function addKolByHandle(handle: string, wallet?: string) {
    const normalized = handle.trim().replace(/^@+/, "");
    if (!normalized) return false;
    setStatus("Hozzáadás...");
    try {
      const res = await fetch("/api/kols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: normalized,
          wallets: wallet?.trim() ? [wallet.trim()] : [],
          autoResolve: !wallet?.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Hiba: ${data.error ?? res.status}`);
        return false;
      }
      setStatus(`@${data.twitterUsername} hozzáadva${data.wallets?.length ? ` (${data.wallets.length} wallet)` : " — csak említések, wallet nélkül"}`);
      await fetchAll();
      return true;
    } catch {
      setStatus("Hiba: nem sikerült menteni. Próbáld újra.");
      return false;
    }
  }

  async function addKol() {
    const ok = await addKolByHandle(newHandle, newWallet);
    if (ok) {
      setNewHandle("");
      setNewWallet("");
    }
  }

  async function importAllWalletKols() {
    setImportingWallets(true);
    setStatus("Tárca KOL-ok importálása...");
    try {
      const res = await fetch("/api/kols/import-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Hiba: ${data.error ?? res.status}`);
        return;
      }
      setStatus(`${data.imported} KOL importálva (wallet + X handle).`);
      await fetchAll();
    } catch {
      setStatus("Hiba: import sikertelen.");
    } finally {
      setImportingWallets(false);
    }
  }

  async function importOneWalletKol(kol: WalletSeedKol) {
    setStatus(`@${kol.twitterUsername} importálása...`);
    const res = await fetch("/api/kols/import-wallets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitterUsernames: [kol.twitterUsername] }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(`Hiba: ${data.error ?? res.status}`);
      return;
    }
    setStatus(`@${kol.twitterUsername} importálva.`);
    await fetchAll();
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
          Az @ jel opcionális — <span className="text-gray-400">ansem</span> és <span className="text-gray-400">@ansem</span> egyaránt működik.
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

      {/* KOL import panel (collapsed by default) */}
      <div className="glass rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setImportOpen((o) => !o)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div>
            <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">
              KOL importálás
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Tárca lista (122) vagy GMGN felfedezés — csak importáláskor kell.
            </p>
          </div>
          <span className="text-gray-500 text-xs shrink-0">{importOpen ? "▲ Bezár" : "▼ Megnyit"}</span>
        </button>

        {importOpen && (
          <>
            <div className="px-4 py-2 border-t border-white/[0.06] flex gap-1">
              <button
                type="button"
                onClick={() => setImportTab("wallets")}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  importTab === "wallets"
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Tárca lista
              </button>
              <button
                type="button"
                onClick={() => setImportTab("discover")}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  importTab === "discover"
                    ? "bg-purple-500/15 text-purple-300"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Felfedezés
              </button>
            </div>

            {importTab === "wallets" && (
      <div>
        <div className="px-4 py-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Ismert Solana KOL tárcák ({walletSeed.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Nick + X handle + Solana wallet.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchWalletSeed}
              disabled={walletSeedLoading}
              className="text-xs text-gray-400 hover:text-cyan-400 disabled:opacity-50"
            >
              {walletSeedLoading ? "..." : "Frissítés"}
            </button>
            <button
              onClick={importAllWalletKols}
              disabled={importingWallets}
              className="px-3 py-1.5 text-xs bg-cyan-500/15 text-cyan-300 rounded-lg hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {importingWallets ? "Import..." : "Összes importálása"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d0d12] z-10">
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2">Nick</th>
                <th className="text-left px-4 py-2">X</th>
                <th className="text-left px-4 py-2">Wallet</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {walletSeedLoading && walletSeed.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Betöltés...</td>
                </tr>
              ) : (
                walletSeed.map((kol) => (
                  <tr key={kol.walletAddress} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-gray-300">{kol.displayName}</td>
                    <td className="px-4 py-2">
                      <a
                        href={`https://x.com/${kol.twitterUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline text-xs"
                      >
                        @{kol.twitterUsername}
                      </a>
                    </td>
                    <td className="px-4 py-2 font-mono text-[10px] text-gray-500">
                      {kol.walletAddress.slice(0, 6)}...{kol.walletAddress.slice(-4)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {kol.alreadyAdded ? (
                        <span className="text-[10px] text-gray-500">Listában</span>
                      ) : (
                        <button
                          onClick={() => importOneWalletKol(kol)}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Import
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
            )}

            {importTab === "discover" && (
      <div>
        <div className="px-4 py-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
              Solana KOL felfedezés
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              GMGN feed + seed. Követőszám szerint rendezve.
            </p>
          </div>
          <button
            onClick={fetchDiscover}
            disabled={discoverLoading}
            className="text-xs text-gray-400 hover:text-cyan-400 disabled:opacity-50"
          >
            {discoverLoading ? "Betöltés..." : "Frissítés"}
          </button>
        </div>
        <div className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap gap-2">
          <select
            value={discoverCategory}
            onChange={(e) => setDiscoverCategory(e.target.value as KolCategory | "")}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-gray-300"
          >
            <option value="">Minden kategória</option>
            {(Object.keys(CATEGORY_LABELS) as KolCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <input
            value={discoverMinFollowers}
            onChange={(e) => setDiscoverMinFollowers(e.target.value)}
            placeholder="Min. követő"
            className="w-28 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-gray-300 placeholder:text-gray-600"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={discoverGmgnOnly}
              onChange={(e) => setDiscoverGmgnOnly(e.target.checked)}
              className="rounded"
            />
            Csak GMGN
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={discoverWalletOnly}
              onChange={(e) => setDiscoverWalletOnly(e.target.checked)}
              className="rounded"
            />
            Csak tárca lista
          </label>
          <button
            onClick={fetchDiscover}
            disabled={discoverLoading}
            className="px-3 py-1.5 text-xs bg-purple-500/15 text-purple-300 rounded-lg hover:bg-purple-500/25 disabled:opacity-50"
          >
            Szűrés
          </button>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d0d12] z-10">
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left px-4 py-2">KOL</th>
                <th className="text-left px-4 py-2">Kategória</th>
                <th className="text-left px-4 py-2">Wallet</th>
                <th className="text-right px-4 py-2">Követők</th>
                <th className="text-left px-4 py-2">Forrás</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {discoverLoading && discovered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Betöltés...</td>
                </tr>
              ) : discovered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nincs találat a szűrőkre.</td>
                </tr>
              ) : (
                discovered.map((kol) => (
                  <tr key={kol.twitterUsername} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-2">
                      <a
                        href={`https://x.com/${kol.twitterUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:underline"
                      >
                        @{kol.twitterUsername}
                      </a>
                      {kol.displayName && (
                        <span className="block text-[10px] text-gray-500">{kol.displayName}</span>
                      )}
                      {kol.notes && (
                        <span className="block text-[10px] text-gray-600 truncate max-w-[180px]">{kol.notes}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {kol.category ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400">
                          {CATEGORY_LABELS[kol.category]}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-[10px] text-gray-500">
                      {kol.walletAddress
                        ? `${kol.walletAddress.slice(0, 6)}...${kol.walletAddress.slice(-4)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-gray-300">
                      {kol.followerCount != null ? (
                        <>
                          {formatFollowers(kol.followerCount)}
                          {kol.followerSource === "approx" && (
                            <span className="text-gray-600 ml-1">~</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {kol.sources.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400"
                          >
                            {SOURCE_LABELS[s]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {kol.alreadyAdded ? (
                        <span className="text-[10px] text-gray-500">Listában</span>
                      ) : (
                        <button
                          onClick={() => addKolByHandle(kol.twitterUsername, kol.walletAddress ?? undefined)}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          Hozzáadás
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
            )}
          </>
        )}
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

      {/* KOL-mentioned tokens — trending-style table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">
              KOL által említett Solana tokenek
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Csak contract címmel azonosított coinok. Klikk → ugyanaz a token oldal, mint a Trending-en.
            </p>
          </div>
          <button
            onClick={fetchKolTokens}
            disabled={tokensLoading}
            className="text-xs text-gray-400 hover:text-cyan-400 disabled:opacity-50"
          >
            {tokensLoading ? "Frissítés..." : "Frissítés"}
          </button>
        </div>
        {tokensLoading && kolTokens.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">Tokenek betöltése...</p>
        ) : (
          <TokenTable
            tokens={tableTokens}
            showInterval="1h"
            customKolCounts={customKolCounts}
            kolCountLabel="Saját KOL"
          />
        )}
        {kolTokens.length > 0 && (
          <div className="mt-2 space-y-1">
            {kolTokens.slice(0, 5).map((r) => (
              <p key={r.token.address} className="text-[10px] text-gray-600">
                <span className="text-gray-400">{r.token.symbol}</span>
                {" — "}
                {r.myKols.map((h) => `@${h}`).join(", ")}
              </p>
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
