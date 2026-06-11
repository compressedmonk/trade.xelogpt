"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ variant = "default" }: { variant?: "default" | "landing" }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/trending");
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Bejelentkezés sikertelen.");
    } catch {
      setError("Hálózati hiba. Próbáld újra.");
    } finally {
      setLoading(false);
    }
  }

  if (variant === "landing") {
    return (
      <form onSubmit={handleSubmit} className="landing-form" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.3em", color: "rgba(6,182,212,0.6)", fontWeight: 500, margin: 0 }}>Secure Gate</p>
          <p style={{ fontSize: 14, color: "rgba(156,163,175,1)", margin: "4px 0 0" }}>Terminal hozzáférés</p>
        </div>
        <div>
          <label htmlFor="password" style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(107,114,128,1)", marginBottom: 8 }}>
            Jelszó
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="landing-input"
            placeholder="••••••••"
          />
        </div>
        {error && <p style={{ fontSize: 14, color: "#f87171", textAlign: "center", margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} className="landing-submit">
          <span style={{ position: "relative", zIndex: 10 }}>{loading ? "Belépés..." : "Belépés a terminálba"}</span>
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-xl p-6 w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm text-gray-400 mb-1.5">
          Jelszó
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
          placeholder="Add meg a jelszót"
        />
      </div>
      {error && <p className="text-sm text-brand-red">{error}</p>}
      <button type="submit" disabled={loading} className="btn-accent w-full py-2 rounded-lg text-sm disabled:opacity-50">
        {loading ? "Belépés..." : "Belépés"}
      </button>
    </form>
  );
}
