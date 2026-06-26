"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/trending", label: "Trending" },
  { href: "/trenches", label: "Trenches" },
  { href: "/mykols", label: "Saját KOL-ok" },
  { href: "/smartmoney", label: "Smart Money" },
  { href: "/copytrade", label: "Copy Trade" },
  { href: "/degen", label: "Degen Bot" },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-50 flex items-center gap-1 px-5 py-3 glass-strong border-t-0 border-x-0 rounded-none">
      <Link href="/trending" className="text-lg font-bold text-cyan-400 text-glow mr-6 tracking-tight">
        Litt-Analyzer
      </Link>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            path?.startsWith(l.href)
              ? "bg-cyan-500/10 text-cyan-400 shadow-glow-sm"
              : "text-gray-400 hover:text-cyan-300 hover:bg-white/[0.04]"
          }`}
        >
          {l.label}
        </Link>
      ))}
      <button
        onClick={handleLogout}
        className="ml-auto px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-brand-red hover:bg-white/[0.04] transition-all duration-200"
      >
        Kijelentkezés
      </button>
    </nav>
  );
}
