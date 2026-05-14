"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/trending", label: "Trending" },
  { href: "/trenches", label: "Trenches" },
  { href: "/smartmoney", label: "Smart Money" },
  { href: "/copytrade", label: "Copy Trade" },
];

export function Nav() {
  const path = usePathname();

  return (
    <nav className="flex items-center gap-1 px-4 py-2 border-b border-brand-border bg-brand-card/80 backdrop-blur-sm">
      <Link href="/trending" className="text-lg font-bold text-brand-green mr-6 tracking-tight">
        SolTrade
      </Link>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            path?.startsWith(l.href)
              ? "bg-brand-green/10 text-brand-green"
              : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
