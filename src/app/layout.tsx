import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Litt-Analyzer — Solana Trading Terminal",
  description: "Personal Solana meme coin trading terminal powered by GMGN",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="flex flex-col min-h-screen">
          <Nav />
          <main className="flex-1 overflow-auto p-4 animate-fade-in">{children}</main>
        </div>
      </body>
    </html>
  );
}
