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
      <h1 className="text-2xl font-bold">Copy Trade</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["wallets", "logs", "manual"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
              tab === t ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            {t === "wallets" ? "Followed Wallets" : t === "logs" ? "Trade Log" : "Manual Swap"}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-500 animate-pulse">Loading...</p>}

      {/* Followed wallets */}
      {tab === "wallets" && !loading && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="bg-brand-card border border-brand-border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-400 uppercase">Add Wallet to Follow</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={newWallet}
                onChange={(e) => setNewWallet(e.target.value)}
                placeholder="Wallet address"
                className="bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 font-mono"
              />
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional)"
                className="bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white placeholder-gray-600"
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 uppercase">Max SOL</label>
                  <input
                    value={newMaxSol}
                    onChange={(e) => setNewMaxSol(e.target.value)}
                    className="w-full bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 uppercase">Slippage %</label>
                  <input
                    value={newSlippage}
                    onChange={(e) => setNewSlippage(e.target.value)}
                    className="w-full bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <button
                onClick={addWallet}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2 text-sm font-medium transition-colors"
              >
                + Add Wallet
              </button>
            </div>
          </div>

          {/* Config list */}
          {configs.length === 0 ? (
            <p className="text-gray-600 text-sm">No wallets being followed</p>
          ) : (
            <div className="space-y-2">
              {configs.map((c) => (
                <div
                  key={c.id}
                  className="bg-brand-card border border-brand-border rounded-lg p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{c.label ?? "Unnamed"}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.enabled ? "bg-green-500/10 text-green-400" : "bg-gray-700 text-gray-500"}`}>
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
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        c.enabled
                          ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                          : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      }`}
                    >
                      {c.enabled ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => removeConfig(c.id)}
                      className="px-3 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
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
        <div className="bg-brand-card border border-brand-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border text-gray-500 text-xs uppercase">
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
                  <tr key={l.id} className="border-b border-brand-border/30 hover:bg-white/[0.02]">
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
                      <span className={l.side === "buy" ? "text-brand-green" : "text-brand-red"}>
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
        <div className="bg-brand-card border border-brand-border rounded-lg p-4 space-y-4 max-w-lg">
          <h2 className="text-sm font-bold text-gray-400 uppercase">Manual Swap</h2>
          <p className="text-xs text-gray-600">
            Execute a swap through the GMGN API. Requires GMGN_PRIVATE_KEY configured.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Your Wallet Address</label>
              <input
                value={manualWallet}
                onChange={(e) => setManualWallet(e.target.value)}
                placeholder="Your SOL wallet address (bound to API key)"
                className="w-full bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Token Address</label>
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Token contract address"
                className="w-full bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white placeholder-gray-600 font-mono"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase">Side</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setManualSide("buy")}
                    className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                      manualSide === "buy"
                        ? "bg-green-600 text-white"
                        : "bg-gray-800 text-gray-500 hover:text-white"
                    }`}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => setManualSide("sell")}
                    className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                      manualSide === "sell"
                        ? "bg-red-600 text-white"
                        : "bg-gray-800 text-gray-500 hover:text-white"
                    }`}
                  >
                    SELL
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase">Amount (SOL)</label>
                <input
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full bg-gray-900 border border-brand-border rounded px-3 py-2 text-sm text-white mt-1"
                />
              </div>
            </div>
            <button
              onClick={manualSwap}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Execute Swap
            </button>
            {swapStatus && (
              <p className={`text-xs ${swapStatus.includes("Error") || swapStatus.includes("Failed") ? "text-red-400" : "text-green-400"}`}>
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
    pending: "bg-yellow-500/10 text-yellow-400",
    submitted: "bg-blue-500/10 text-blue-400",
    confirmed: "bg-green-500/10 text-green-400",
    failed: "bg-red-500/10 text-red-400",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[status] ?? "bg-gray-700 text-gray-400"}`}>
      {status.toUpperCase()}
    </span>
  );
}
