"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/scoring";

interface KolProfile {
  id: number;
  twitterUsername: string;
  displayName: string | null;
  profileType?: string;
  sentimentWeight?: number;
  enabled: boolean;
}

interface FeedItem {
  id: string;
  type: "mention" | "buy" | "sell";
  timestamp: number;
  twitterUsername: string;
  displayName: string | null;
  tokenAddress?: string;
  tokenSymbol?: string;
  detail?: string;
  topicCategory?: string | null;
  cryptoSentiment?: string | null;
  sentimentReasoning?: string | null;
}

interface MacroSentiment {
  index: number;
  label: "bullish" | "neutral" | "bearish";
  momentum1h: number;
  momentum4h: number;
  momentum24h: number;
  surge: string | null;
  postCount: number;
  model: string | null;
}

export function SentimentClient() {
  const [profiles, setProfiles] = useState<KolProfile[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [macroSentiment, setMacroSentiment] = useState<MacroSentiment | null>(null);
  const [importingNewsmakers, setImportingNewsmakers] = useState(false);
  const [status, setStatus] = useState("");

  const fetchMacroSentiment = useCallback(async () => {
    try {
      const res = await fetch("/api/kols/sentiment/macro");
      if (res.ok) setMacroSentiment(await res.json());
    } catch {
      // ignore
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    const res = await fetch("/api/kols?profileType=newsmaker");
    if (!res.ok) {
      setStatus("Hiba: newsmaker lista nem tölthető be.");
      setProfiles([]);
      return;
    }
    const data = await res.json();
    setProfiles(Array.isArray(data) ? data : []);
  }, []);

  const fetchFeed = useCallback(async () => {
    setFeedLoading(true);
    try {
      const res = await fetch("/api/kols/feed?limit=50&profileType=newsmaker");
      const data = await res.json();
      setFeed(Array.isArray(data) ? data.filter((i: FeedItem) => i.type === "mention") : []);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProfiles(), fetchFeed(), fetchMacroSentiment()]).finally(() =>
      setLoading(false),
    );
    const interval = setInterval(() => {
      fetchFeed();
      fetchMacroSentiment();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchProfiles, fetchFeed, fetchMacroSentiment]);

  async function addNewsmaker() {
    const normalized = newHandle.trim().replace(/^@+/, "");
    if (!normalized) return;
    setStatus("Hozzáadás...");
    try {
      const res = await fetch("/api/kols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterUsername: normalized,
          wallets: [],
          autoResolve: false,
          profileType: "newsmaker",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Hiba: ${data.error ?? res.status}`);
        return;
      }
      setStatus(`@${data.twitterUsername} newsmaker hozzáadva`);
      setNewHandle("");
      await Promise.all([fetchProfiles(), fetchFeed(), fetchMacroSentiment()]);
    } catch {
      setStatus("Hiba: nem sikerült menteni.");
    }
  }

  async function importNewsmakers() {
    setImportingNewsmakers(true);
    setStatus("Newsmaker profilok importálása...");
    try {
      const res = await fetch("/api/kols/import-newsmakers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Hiba: ${data.error ?? res.status}`);
        return;
      }
      setStatus(`${data.imported} newsmaker importálva (Trump, Musk, Bloomberg stb.).`);
      await Promise.all([fetchProfiles(), fetchFeed(), fetchMacroSentiment()]);
    } catch {
      setStatus("Hiba: newsmaker import sikertelen.");
    } finally {
      setImportingNewsmakers(false);
    }
  }

  async function toggleEnabled(profile: KolProfile) {
    await fetch("/api/kols", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: profile.id, enabled: !profile.enabled }),
    });
    fetchProfiles();
  }

  async function deleteProfile(id: number) {
    await fetch("/api/kols", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await Promise.all([fetchProfiles(), fetchFeed(), fetchMacroSentiment()]);
  }

  const sentimentLabel = (s?: string | null) => {
    if (s === "bullish") return "BULL";
    if (s === "bearish") return "BEAR";
    if (s === "neutral") return "NEU";
    return "—";
  };

  const sentimentColor = (s?: string | null) => {
    if (s === "bullish") return "text-brand-green";
    if (s === "bearish") return "text-brand-red";
    if (s === "neutral") return "text-brand-yellow";
    return "text-gray-600";
  };

  const moodColor = (label?: string) => {
    if (label === "bullish") return "text-brand-green";
    if (label === "bearish") return "text-brand-red";
    return "text-brand-yellow";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gradient mb-1">Sentiment</h1>
        <p className="text-sm text-gray-500">
          Newsmaker X fiókok AI sentiment elemzése — makró piaci hangulat és kriptó mood index.
        </p>
      </div>

      {macroSentiment && (
        <div className="glass rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
                Crypto Mood Index
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Newsmaker X posztok AI sentimentje (o3) — makró + kriptó
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className={`text-2xl font-bold ${moodColor(macroSentiment.label)}`}>
                  {macroSentiment.index > 0 ? "+" : ""}
                  {macroSentiment.index}
                </span>
                <span className={`ml-2 text-xs font-bold uppercase ${moodColor(macroSentiment.label)}`}>
                  {macroSentiment.label}
                </span>
              </div>
              {macroSentiment.surge && (
                <span className="text-[10px] px-2 py-1 rounded bg-brand-red/15 text-brand-red font-bold uppercase">
                  {macroSentiment.surge}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
            <div>
              <span className="text-gray-500 block">1h momentum</span>
              <span className={macroSentiment.momentum1h >= 0 ? "text-brand-green" : "text-brand-red"}>
                {macroSentiment.momentum1h > 0 ? "+" : ""}
                {macroSentiment.momentum1h}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">4h momentum</span>
              <span className={macroSentiment.momentum4h >= 0 ? "text-brand-green" : "text-brand-red"}>
                {macroSentiment.momentum4h > 0 ? "+" : ""}
                {macroSentiment.momentum4h}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Posztok (48h)</span>
              <span className="text-gray-300">{macroSentiment.postCount}</span>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Newsmaker hozzáadása</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="@username (pl. elonmusk)"
            className="flex-1 min-w-[140px] bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600"
          />
          <button
            onClick={addNewsmaker}
            className="px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-lg text-sm font-medium hover:bg-cyan-500/30 transition-colors"
          >
            Hozzáadás
          </button>
          <button
            onClick={importNewsmakers}
            disabled={importingNewsmakers}
            className="px-4 py-2 bg-cyan-500/15 text-cyan-300 rounded-lg text-sm font-medium hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
          >
            {importingNewsmakers ? "Import..." : "Newsmaker seed import"}
          </button>
        </div>
        {status && <p className="text-xs text-gray-400">{status}</p>}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
            Newsmaker lista ({profiles.length})
          </h2>
        </div>
        {loading ? (
          <p className="p-4 text-gray-500 text-sm">Betöltés...</p>
        ) : profiles.length === 0 ? (
          <p className="p-4 text-gray-500 text-sm">
            Még nincs newsmaker. Adj hozzá egy @handle-t vagy importáld a seed listát.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {profiles.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
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
                  {p.sentimentWeight != null && p.sentimentWeight !== 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-400">
                      w={p.sentimentWeight}
                    </span>
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      p.enabled ? "bg-brand-green/10 text-brand-green" : "bg-white/[0.06] text-gray-500"
                    }`}
                  >
                    {p.enabled ? "AKTÍV" : "SZÜNET"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleEnabled(p)} className="text-xs text-gray-400 hover:text-gray-300">
                    {p.enabled ? "Szünet" : "Aktiválás"}
                  </button>
                  <button onClick={() => deleteProfile(p.id)} className="text-xs text-brand-red hover:text-red-300">
                    Törlés
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Newsmaker feed</h2>
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
                <th className="text-left px-4 py-2">Newsmaker</th>
                <th className="text-left px-4 py-2">Token</th>
                <th className="text-left px-4 py-2">Poszt</th>
                <th className="text-left px-4 py-2">Sentiment</th>
                <th className="text-left px-4 py-2">Téma</th>
              </tr>
            </thead>
            <tbody>
              {feed.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nincs newsmaker poszt. Adj hozzá profilokat és várj a szinkronizálásra.
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
                    <td
                      className="px-4 py-2 text-gray-400 max-w-[240px] truncate text-xs"
                      title={item.sentimentReasoning ?? undefined}
                    >
                      {item.detail}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold ${sentimentColor(item.cryptoSentiment)}`}>
                        {sentimentLabel(item.cryptoSentiment)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {item.topicCategory && item.topicCategory !== "off_topic" ? (
                        <span className="text-[9px] text-gray-500 uppercase">
                          {item.topicCategory === "macro_market" ? "MACRO" : "CRYPTO"}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
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
