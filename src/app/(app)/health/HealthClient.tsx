"use client";

import { useCallback, useEffect, useState } from "react";
import type { HealthLevel, HealthSnapshot } from "@/lib/health-status";

function statusColor(status: HealthLevel): string {
  if (status === "ok") return "text-brand-green";
  if (status === "warn") return "text-brand-yellow";
  if (status === "error") return "text-brand-red";
  return "text-gray-500";
}

function statusBadge(status: HealthLevel): string {
  if (status === "ok") return "bg-brand-green/10 text-brand-green";
  if (status === "warn") return "bg-brand-yellow/10 text-brand-yellow";
  if (status === "error") return "bg-brand-red/10 text-brand-red";
  return "bg-white/[0.06] text-gray-500";
}

function statusLabel(status: HealthLevel): string {
  if (status === "ok") return "OK";
  if (status === "warn") return "FIGYELEM";
  if (status === "error") return "HIBA";
  return "KI";
}

function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}ó ${m}p` : `${m}p`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("hu-HU");
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function MetricBar({ pct, warn = 70, danger = 90 }: { pct: number; warn?: number; danger?: number }) {
  const color = pct >= danger ? "bg-brand-red" : pct >= warn ? "bg-brand-yellow" : "bg-brand-green";
  return (
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export function HealthClient() {
  const [data, setData] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Betöltés sikertelen");
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
    return <p className="text-gray-500 text-sm py-8 text-center">Státusz betöltése...</p>;
  }

  if (error && !data) {
    return <p className="text-brand-red text-sm py-8 text-center">{error}</p>;
  }

  if (!data) return null;

  const serverStatus: HealthLevel =
    data.server.loadPct >= 90 || data.server.memory.usedPct >= 95
      ? "error"
      : data.server.loadPct >= 70 || data.server.memory.usedPct >= 85
        ? "warn"
        : "ok";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient mb-1">Rendszer státusz</h1>
          <p className="text-sm text-gray-500">
            Szerver terhelés, API kvóták és szolgáltatások állapota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Frissítve: {fmtTime(data.checkedAt)}</span>
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs rounded-lg bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
          >
            Frissítés
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Server */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Szerver</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge(serverStatus)}`}>
              {statusLabel(serverStatus)}
            </span>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between text-gray-500 mb-1">
                <span>CPU terhelés (1m avg)</span>
                <span className={statusColor(serverStatus)}>{data.server.loadPct}%</span>
              </div>
              <MetricBar pct={data.server.loadPct} />
              <p className="text-[10px] text-gray-600 mt-1">
                Load: {data.server.loadAvg.map((v) => v.toFixed(2)).join(" / ")} · {data.server.cpuCount} CPU
              </p>
            </div>
            <div>
              <div className="flex justify-between text-gray-500 mb-1">
                <span>Memória</span>
                <span>{data.server.memory.usedMb} / {data.server.memory.totalMb} MB</span>
              </div>
              <MetricBar pct={data.server.memory.usedPct} warn={85} danger={95} />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <span className="text-gray-500 block">Uptime</span>
                <span className="text-gray-300">{fmtUptime(data.server.uptimeSec)}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Node process</span>
                <span className="text-gray-300">{data.server.process.rssMb} MB RSS</span>
              </div>
            </div>
          </div>
        </div>

        {/* X API */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">X (Twitter) API</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge(data.twitter.status)}`}>
              {statusLabel(data.twitter.status)}
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <p className={statusColor(data.twitter.status)}>{data.twitter.message}</p>
            {data.twitter.rateLimit && (
              <div>
                <div className="flex justify-between text-gray-500 mb-1">
                  <span>Rate limit kvóta</span>
                  <span>{data.twitter.rateLimit.remaining} / {data.twitter.rateLimit.limit}</span>
                </div>
                <MetricBar
                  pct={Math.round((1 - data.twitter.rateLimit.remaining / data.twitter.rateLimit.limit) * 100)}
                  warn={80}
                  danger={95}
                />
                <p className="text-[10px] text-gray-600 mt-1">
                  Reset: {fmtTime(data.twitter.rateLimit.resetAt)}
                </p>
              </div>
            )}
            {data.twitter.latencyMs != null && (
              <p className="text-gray-500">Válaszidő: {data.twitter.latencyMs} ms</p>
            )}
          </div>
        </div>

        {/* OpenAI */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">OpenAI API</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge(data.openai.status)}`}>
              {statusLabel(data.openai.status)}
            </span>
          </div>
          <div className="space-y-2 text-xs">
            <p className={statusColor(data.openai.status)}>{data.openai.message}</p>
            {data.openai.model && (
              <p className="text-gray-500">Sentiment modell: <span className="text-gray-300">{data.openai.model}</span></p>
            )}
            {data.openai.balance && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-gray-500 block">Elérhető</span>
                  <span className="text-brand-green font-medium">{fmtUsd(data.openai.balance.available)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">
                    {data.openai.balance.available == null ? "30 napi költség" : "Felhasznált"}
                  </span>
                  <span className="text-gray-300">{fmtUsd(data.openai.balance.used)}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Összes credit</span>
                  <span className="text-gray-300">{fmtUsd(data.openai.balance.granted)}</span>
                </div>
              </div>
            )}
            {data.openai.latencyMs != null && (
              <p className="text-gray-500">Válaszidő: {data.openai.latencyMs} ms</p>
            )}
          </div>
        </div>

        {/* GMGN */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">GMGN API</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge(data.gmgn.status)}`}>
              {statusLabel(data.gmgn.status)}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <p className={statusColor(data.gmgn.status)}>{data.gmgn.message}</p>
            {data.gmgn.latencyMs != null && (
              <p className="text-gray-500">Válaszidő: {data.gmgn.latencyMs} ms</p>
            )}
          </div>
        </div>

        {/* Telegram */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Telegram</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge(data.telegram.status)}`}>
              {statusLabel(data.telegram.status)}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <p className={statusColor(data.telegram.status)}>{data.telegram.message}</p>
            {data.telegram.latencyMs != null && (
              <p className="text-gray-500">Válaszidő: {data.telegram.latencyMs} ms</p>
            )}
          </div>
        </div>

        {/* Database + KOL sync */}
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Adatbázis & KOL sync</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge(data.database.status)}`}>
              {statusLabel(data.database.status)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500 block">DB válaszidő</span>
              <span className="text-gray-300">{data.database.latencyMs} ms</span>
            </div>
            <div>
              <span className="text-gray-500 block">KOL profilok</span>
              <span className="text-gray-300">{data.database.kolProfiles}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Pending sentiment</span>
              <span className={data.database.pendingClassifications > 10 ? "text-brand-yellow" : "text-gray-300"}>
                {data.database.pendingClassifications}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">KOL sync</span>
              <span className={data.kolSync.enabled ? "text-brand-green" : "text-gray-500"}>
                {data.kolSync.enabled ? "AKTÍV" : "KI"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500 block">Utolsó sync</span>
              <span className="text-gray-300">
                {data.kolSync.lastSyncAt ? fmtTime(data.kolSync.lastSyncAt) : "—"}
                {data.kolSync.lastSyncResult && (
                  <span className="text-gray-500 ml-2">
                    ({data.kolSync.lastSyncResult.classified} ok, {data.kolSync.lastSyncResult.failed} hiba)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
