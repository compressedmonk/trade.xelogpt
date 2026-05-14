"use client";

import { useEffect, useState, useCallback } from "react";

interface CopyConfig {
  id: number;
  walletAddress: string;
  chain: string;
  label: string | null;
  enabled: boolean;
  maxPositionSol: number;
  slippage: number;
  autoTp: number | null;
  autoSl: number | null;
  createdAt: string;
}

interface TradeLogEntry {
  id: number;
  orderId: string | null;
  chain: string;
  tokenAddress: string;
  tokenSymbol: string | null;
  side: string;
  amountSol: number;
  amountToken: number | null;
  price: number | null;
  status: string;
  source: string | null;
  triggeredBy: string | null;
  createdAt: string;
}

export function CopyTradeClient() {
  const [configs, setConfigs] = useState<CopyConfig[]>([]);
  const [logs, setLogs] = useState<TradeLogEntry[]>([]);
  const [tab, setTab] = useState<"wallets" | "logs" | "manual">("wallets");
  const [loading, setLoading] = useState(true);

  const [newWallet, setNewWallet] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMaxSol, setNewMaxSol] = useState("0.1");
  const [newSlippage, setNewSlippage] = useState("0.5");

  const [manualToken, setManualToken] = useState("");
  const [manualAmount, setManualAmount] = useState("0.05");
  const [manualSide, setManualSide] = useState<"buy" | "sell">("buy");
  const [manualWallet, setManualWallet] = useState("");
  const [swapStatus, setSwapStatus] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [cfgRes, logRes] = await Promise.all([
      fetch("/api/copytrade").then((r) => r.json()),
      fetch("/api/copytrade/logs").then((r) => r.json()),
    ]);
    setConfigs(Array.isArray(cfgRes) ? cfgRes : []);
    setLogs(Array.isArray(logRes) ? logRes : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function addWallet() {
    if (!newWallet.trim()) return;
    await fetch("/api/copytrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: newWallet.trim(),
        label: newLabel.trim() || undefined,
        maxPositionSol: parseFloat(newMaxSol) || 0.1,
        slippage: parseFloat(newSlippage) || 0.5,
      }),
    });
    setNewWallet("");
    setNewLabel("");
    fetchAll();
  }

  async function toggleConfig(id: number, enabled: boolean) {
    await fetch("/api/copytrade", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    fetchAll();
  }

  async function removeConfig(id: number) {
    await fetch("/api/copytrade", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  }

  async function manualSwap() {
    if (!manualToken || !manualWallet || !manualAmount) return;
    setSwapStatus("Submitting...");
    try {
      const res = await fetch("/api/copytrade/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenAddress: manualToken.trim(),
          side: manualSide,
          amountSol: parseFloat(manualAmount),
          fromAddress: manualWallet.trim(),
          slippage: 0.5,
          triggeredBy: "manual",
        }),
      });
      const data = await res.json();
      if (data.error) {
        setSwapStatus(`Error: ${data.error}`);
      } else {
        setSwapStatus(`Submitted! Order: ${data.orderId ?? "pending"}`);
        fetchAll();
      }
    } catch (e: any) {
      setSwapStatus(`Failed: ${e.message}`);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gradient">Copy Trade</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["wallets", "logs", "manual"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all duration-200 ${
              tab === t
                ? "bg-cyan-500/15 text-cyan-400 shadow-glow-sm"
                : "text-gray-400 hover:text-cyan-300 hover:bg-white/[0.04]"
            }`}
          >
            {t === "wallets" ? "Followed Wallets" : t === "logs" ? "Trade Log" : "Manual Swap"}
          </button>
        ))}
      </div>

      {loading && <p className="text-cyan-400/60 animate-pulse">Loading...</p>}

      {/* Followed wallets */}
      {tab === "wallets" && !loading && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Add Wallet to Follow</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={newWallet}
                onChange={(e) => setNewWallet(e.target.value)}
                placeholder="Wallet address"
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-500/20 transition-all"
              />
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional)"
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-500/20 transition-all"
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Max SOL</label>
                  <input
                    value={newMaxSol}
                    onChange={(e) => setNewMaxSol(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider">Slippage %</label>
                  <input
                    value={newSlippage}
                    onChange={(e) => setNewSlippage(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  />
                </div>
              </div>
              <button
                onClick={addWallet}
                className="btn-accent rounded-lg px-4 py-2.5 text-sm"
              >
                + Add Wallet
              </button>
            </div>
          </div>

          {configs.length === 0 ? (
            <p className="text-gray-600 text-sm">No wallets being followed</p>
          ) : (
            <div className="space-y-3">
              {configs.map((c) => (
                <div
                  key={c.id}
                  className="glass glass-hover rounded-xl p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{c.label ?? "Unnamed"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                        c.enabled
                          ? "bg-brand-green/10 text-brand-green shadow-[0_0_8px_rgba(52,211,153,0.15)]"
                          : "bg-white/[0.06] text-gray-500"
                      }`}>
                        {c.enabled ? "ACTIVE" : "PAUSED"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono truncate">{c.walletAddress}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{c.maxPositionSol} SOL max</span>
                    <span>{c.slippage}% slip</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleConfig(c.id, !c.enabled)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        c.enabled
                          ? "bg-brand-yellow/10 text-brand-yellow hover:bg-brand-yellow/20"
                          : "bg-brand-green/10 text-brand-green hover:bg-brand-green/20"
                      }`}
                    >
                      {c.enabled ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => removeConfig(c.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-red/10 text-brand-red hover:bg-brand-red/20 transition-all duration-200"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trade log */}
      {tab === "logs" && !loading && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase bg-white/[0.02]">
                <th className="text-left p-3">Time</th>
                <th className="text-left p-3">Token</th>
                <th className="text-left p-3">Side</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-600 py-8">
                    No trades yet
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-t border-white/[0.04] hover:bg-cyan-500/[0.03] transition-colors duration-150">
                    <td className="p-3 text-gray-500 text-xs">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <span className="text-white font-medium">{l.tokenSymbol ?? "?"}</span>
                      <span className="text-gray-600 text-xs ml-1 font-mono">
                        {l.tokenAddress.slice(0, 6)}...
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                        l.side === "buy" ? "bg-brand-green/10 text-brand-green" : "bg-brand-red/10 text-brand-red"
                      }`}>
                        {l.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-gray-300">
                      {l.amountSol} SOL
                    </td>
                    <td className="p-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{l.source ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual swap */}
      {tab === "manual" && !loading && (
        <div className="glass rounded-xl p-5 space-y-4 max-w-lg">
          <h2 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Manual Swap</h2>
          <p className="text-xs text-gray-600">
            Execute a swap through the GMGN API. Requires GMGN_PRIVATE_KEY configured.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Your Wallet Address</label>
              <input
                value={manualWallet}
                onChange={(e) => setManualWallet(e.target.value)}
                placeholder="Your SOL wallet address (bound to API key)"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Token Address</label>
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Token contract address"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Side</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setManualSide("buy")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      manualSide === "buy"
                        ? "bg-brand-green/20 text-brand-green border border-brand-green/20"
                        : "bg-white/[0.04] text-gray-500 border border-white/[0.08] hover:text-white"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => setManualSide("sell")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      manualSide === "sell"
                        ? "bg-brand-red/20 text-brand-red border border-brand-red/20"
                        : "bg-white/[0.04] text-gray-500 border border-white/[0.08] hover:text-white"
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Amount (SOL)</label>
                <input
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white mt-1 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                />
              </div>
            </div>
            <button
              onClick={manualSwap}
              className="w-full btn-accent rounded-lg px-4 py-3 text-sm"
            >
              Execute Swap
            </button>
            {swapStatus && (
              <p className={`text-xs ${swapStatus.includes("Error") || swapStatus.includes("Failed") ? "text-brand-red" : "text-brand-green"}`}>
                {swapStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-brand-yellow/10 text-brand-yellow",
    submitted: "bg-cyan-500/10 text-cyan-400",
    confirmed: "bg-brand-green/10 text-brand-green shadow-[0_0_8px_rgba(52,211,153,0.15)]",
    failed: "bg-brand-red/10 text-brand-red",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${colors[status] ?? "bg-white/[0.06] text-gray-400"}`}>
      {status.toUpperCase()}
    </span>
  );
}
