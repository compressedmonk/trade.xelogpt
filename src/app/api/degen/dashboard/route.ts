import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { degenDbConfigured, listDegenBuys, listDegenSweeps } from "@/lib/degen-db";
import { fetchDexTokens, rawToUi } from "@/lib/dexscreener";

const GAS_RESERVE = Number(process.env.DEGEN_GAS_RESERVE_SOL ?? "0.02");

async function botBalanceSol(address: string): Promise<number | null> {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) return null;
  try {
    const conn = new Connection(rpc, "confirmed");
    const lamports = await conn.getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

export async function GET() {
  const botWallet = process.env.DEGEN_BOT_WALLET ?? "";
  const destWallet = process.env.DEGEN_DEST_WALLET ?? "";
  const dryRun = (process.env.DEGEN_DRY_RUN ?? "true").toLowerCase() !== "false";

  const sweeps = listDegenSweeps(100);
  const buys = listDegenBuys(50);
  const mints = sweeps.map((s) => s.mint);
  const dex = await fetchDexTokens(mints);

  const positions = sweeps
    .filter((s) => s.status === "swept")
    .map((s) => {
      const meta = dex.get(s.mint);
      const decimals = meta?.decimals ?? 6;
      const qty = rawToUi(s.amount, decimals);
      const priceUsd = meta?.priceUsd ?? null;
      const priceSol = meta?.priceSol ?? null;
      const costSol = s.solSpent ?? 0;
      const solUsd = priceSol && priceUsd ? priceUsd / priceSol : null;
      const costUsd = solUsd != null ? costSol * solUsd : null;
      const valueUsd = priceUsd != null ? qty * priceUsd : null;
      const valueSol = priceSol != null ? qty * priceSol : null;
      const buyPriceUsd = qty > 0 && costUsd != null ? costUsd / qty : null;
      const buyPriceSol = qty > 0 && costSol > 0 ? costSol / qty : null;
      const pnlUsd = valueUsd != null && costUsd != null ? valueUsd - costUsd : null;
      const pnlPct = costUsd != null && costUsd > 0 && pnlUsd != null ? (pnlUsd / costUsd) * 100 : null;

      return {
        id: s.id,
        mint: s.mint,
        symbol: meta?.symbol ?? s.mint.slice(0, 6),
        name: meta?.name ?? "Unknown",
        qty,
        costSol,
        buyPriceSol,
        buyPriceUsd,
        priceUsd,
        priceSol,
        valueUsd,
        valueSol,
        pnlUsd,
        pnlPct,
        marketCapUsd: meta?.marketCapUsd ?? null,
        sweepTx: s.sweepTxSignature,
        buyTx: s.buyTxSignature,
        createdAt: s.createdAt,
        dexUrl: meta?.pairUrl,
      };
    });

  const balanceSol = botWallet ? await botBalanceSol(botWallet) : null;
  const spendableSol = balanceSol != null ? Math.max(0, balanceSol - GAS_RESERVE) : null;
  const portfolioValueUsd = positions.reduce((sum, p) => sum + (p.valueUsd ?? 0), 0);

  return NextResponse.json({
    configured: degenDbConfigured(),
    dryRun,
    botWallet,
    destWallet,
    balance: {
      sol: balanceSol,
      spendableSol,
      reserveSol: GAS_RESERVE,
    },
    portfolioValueUsd,
    positions,
    recentBuys: buys,
  });
}
