import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Litt-Analyzer — Solana Trading Terminal",
  description: "Personal Solana meme coin trading terminal powered by GMGN",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
