"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const mainLinks = [
  { href: "/mykols", label: "Saját KOL-ok" },
  { href: "/sentiment", label: "Sentiment" },
  { href: "/degen", label: "Degen Bot" },
  { href: "/apha", label: "apha_bot" },
  { href: "/liqwick/", label: "LiqWick", external: true },
  { href: "/health", label: "Státusz" },
] as const;

const solanaSubLinks = [
  { href: "/smartmoney", label: "Smart Money" },
  { href: "/copytrade", label: "Copy Trade" },
  { href: "/trending", label: "Trending" },
  { href: "/trenches", label: "Trenches" },
] as const;

function linkClass(active: boolean): string {
  return `block px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
    active
      ? "bg-cyan-500/10 text-cyan-400 shadow-glow-sm"
      : "text-gray-400 hover:text-cyan-300 hover:bg-white/[0.04]"
  }`;
}

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const solanaActive = solanaSubLinks.some((l) => path?.startsWith(l.href));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-1 px-5 py-3 glass-strong border-t-0 border-x-0 rounded-none">
      <Link href="/mykols" className="text-lg font-bold text-cyan-400 text-glow mr-6 tracking-tight">
        Litt-Analyzer
      </Link>

      {mainLinks.map((l) =>
        "external" in l && l.external ? (
          <a key={l.href} href={l.href} className={linkClass(false)}>
            {l.label}
          </a>
        ) : (
          <Link key={l.href} href={l.href} className={linkClass(path?.startsWith(l.href) ?? false)}>
            {l.label}
          </Link>
        ),
      )}

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
            solanaActive || menuOpen
              ? "bg-cyan-500/10 text-cyan-400 shadow-glow-sm"
              : "text-gray-400 hover:text-cyan-300 hover:bg-white/[0.04]"
          }`}
          aria-expanded={menuOpen}
          aria-haspopup="true"
        >
          Solana
          <span className="text-[10px] opacity-70">{menuOpen ? "▲" : "▼"}</span>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full mt-1 min-w-[11rem] py-1 glass-strong border border-white/10 rounded-lg shadow-lg">
            {solanaSubLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`${linkClass(path?.startsWith(l.href) ?? false)} mx-1`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="ml-auto px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-brand-red hover:bg-white/[0.04] transition-all duration-200"
      >
        Kijelentkezés
      </button>
    </nav>
  );
}
