import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

import { degenDbConfigured, listDegenBuys, listDegenSweeps } from "@/lib/degen-db";
import {
  extraBotWallet,
  loadDegenWatchProfiles,
  primaryBotWallet,
  profileForUser,
  destWallet,
} from "@/lib/degen-profiles";
import { resolveEnv } from "@/lib/shared-env";
import { fetchDexTokens, rawToUi } from "@/lib/dexscreener";

const GAS_RESERVE = Number(
  process.env.DEGEN_GAS_RESERVE_SOL ?? resolveEnv("DEGEN_GAS_RESERVE_SOL") ?? "0.02",
);

async function walletBalanceSol(address: string): Promise<number | null> {
  const rpc = process.env.SOLANA_RPC_URL ?? resolveEnv("SOLANA_RPC_URL");
  if (!rpc || !address) return null;
  try {
    const conn = new Connection(rpc, "confirmed");
    const lamports = await conn.getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

function walletCard(
  id: "primary" | "extra",
  label: string,
  address: string,
  balanceSol: number | null,
  buyLabel: string,
  buyPerTriggerSol: number | null,
) {
  const spendableSol = balanceSol != null ? Math.max(0, balanceSol - GAS_RESERVE) : null;
  return {
    id,
    label,
    address,
    balanceSol,
    spendableSol,
    reserveSol: GAS_RESERVE,
    buyLabel,
    buyPerTriggerSol,
  };
}

export async function GET() {
  const dryRun =
    (process.env.DEGEN_DRY_RUN ?? resolveEnv("DRY_RUN") ?? "true").toLowerCase() !== "false";

  const primaryAddress = primaryBotWallet();
  const extraAddress = extraBotWallet();
  const sweepDest = destWallet();

  const profiles = loadDegenWatchProfiles();
  const primaryProfile = profiles.find((p) => p.tag === "primary");
  const extraProfiles = profiles.filter((p) => p.tag === "extra");

  const [primaryBal, extraBal] = await Promise.all([
    primaryAddress ? walletBalanceSol(primaryAddress) : null,
    extraAddress ? walletBalanceSol(extraAddress) : null,
  ]);

  const primarySpendable = primaryBal != null ? Math.max(0, primaryBal - GAS_RESERVE) : null;
  const extraSpendable = extraBal != null ? Math.max(0, extraBal - GAS_RESERVE) : null;
  const extraFraction = extraProfiles[0]?.buyFraction ?? null;
  const extraBuyPerTrigger =
    extraSpendable != null && extraFraction != null ? extraSpendable * extraFraction : null;

  const wallets = [
    walletCard(
      "primary",
      "Primary (Johnny)",
      primaryAddress,
      primaryBal,
      primaryProfile?.buyLabel ?? "full spendable",
      primarySpendable,
    ),
  ];

  if (extraAddress || extraProfiles.length > 0) {
    wallets.push(
      walletCard(
        "extra",
        "Extra (shared)",
        extraAddress,
        extraBal,
        extraProfiles.length > 0
          ? `${extraProfiles.length} user · ${extraProfiles[0]?.buyLabel ?? "—"}`
          : "—",
        extraBuyPerTrigger,
      ),
    );
  }

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

  const portfolioValueUsd = positions.reduce((sum, p) => sum + (p.valueUsd ?? 0), 0);

  const recentBuys = buys.map((b) => {
    const prof = profileForUser(b.authorId);
    return {
      discordMsgId: b.discordMsgId,
      mint: b.mint,
      authorId: b.authorId,
      authorLabel: prof?.label ?? b.authorId,
      profileTag: prof?.tag ?? null,
      status: b.status,
      solSpent: b.solSpent,
      reason: b.reason,
      latencyMs: b.latencyMs,
      txSignature: b.txSignature,
      createdAt: b.createdAt,
    };
  });

  const buyStats = {
    total: buys.length,
    bought: buys.filter((b) => b.status === "bought").length,
    error: buys.filter((b) => b.status === "error").length,
    skipped: buys.filter((b) => b.status === "skipped" || b.status === "dry_run").length,
  };

  return NextResponse.json({
    configured: degenDbConfigured(),
    dryRun,
    destWallet: sweepDest,
    wallets,
    watchProfiles: profiles.map((p) => ({
      userId: p.userId,
      label: p.label,
      tag: p.tag,
      buyMode: p.buyMode,
      buyFraction: p.buyFraction ?? null,
      buyLabel: p.buyLabel,
      walletId: p.tag === "primary" ? "primary" : "extra",
    })),
    portfolioValueUsd,
    positions,
    recentBuys,
    buyStats,
  });
}
