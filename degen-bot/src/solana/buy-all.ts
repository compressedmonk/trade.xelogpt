import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config.js";
import type { WatchProfile } from "../watch-profiles.js";
import { getConnection, getKeypairFromPrivateKey, getWalletAddressFromPrivateKey } from "./wallet.js";
import { sweepTokenToDest, type SweepResult } from "./sweep-token.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

function jupiterBaseUrl(): string {
  return config.jupiterApiKey
    ? "https://api.jup.ag/swap/v1"
    : "https://lite-api.jup.ag/swap/v1";
}

export interface BuyResult {
  status: "bought" | "dry_run" | "skipped";
  mint: string;
  solSpent: number;
  outAmount?: string;
  txSignature?: string;
  sweep?: SweepResult | null;
  reason?: string;
  latencyMs: number;
  profileUserId?: string;
  buyFraction?: number;
  walletAddress?: string;
}

function jupiterHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.jupiterApiKey) headers["x-api-key"] = config.jupiterApiKey;
  return headers;
}

async function fetchQuote(outputMint: string, amountLamports: number): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint,
    amount: String(amountLamports),
    slippageBps: String(config.slippageBps),
  });
  const res = await fetch(`${jupiterBaseUrl()}/quote?${params}`, {
    headers: jupiterHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  const quote = (await res.json()) as Record<string, unknown>;
  if (quote.error) throw new Error(`Jupiter quote error: ${String(quote.error)}`);
  return quote;
}

async function fetchSwapTransaction(
  quoteResponse: Record<string, unknown>,
  userPublicKey: string,
): Promise<string> {
  const res = await fetch(`${jupiterBaseUrl()}/swap`, {
    method: "POST",
    headers: { ...jupiterHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: config.priorityFeeLamports,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Jupiter swap build failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as Record<string, unknown>;
  if (data.error) throw new Error(`Jupiter swap error: ${String(data.error)}`);
  if (!data.swapTransaction) throw new Error("Jupiter swap response missing swapTransaction");
  return data.swapTransaction as string;
}

function spendableLamports(balance: number): number {
  const reserveLamports = Math.floor(config.gasReserveSol * LAMPORTS_PER_SOL);
  return Math.max(0, balance - reserveLamports);
}

function resolveBuyLamports(balance: number, profile: WatchProfile): number {
  const spendable = spendableLamports(balance);

  if (profile.buyMode === "full") {
    return spendable;
  }

  const fraction = Math.min(1, Math.max(0, profile.buyFraction ?? 0));
  return Math.floor(spendable * fraction);
}

/**
 * Buys `mint` using the profile's wallet. Primary: full spendable balance.
 * Extra: buyFraction of spendable on the shared extra wallet.
 */
export async function buyForProfile(mint: string, profile: WatchProfile): Promise<BuyResult> {
  const startedAt = Date.now();
  const minLamports = Math.floor(config.minBuySol * LAMPORTS_PER_SOL);
  const hasWallet = Boolean(profile.walletPrivateKey);
  const walletAddress = hasWallet
    ? getWalletAddressFromPrivateKey(profile.walletPrivateKey)
    : undefined;

  let amountLamports: number;
  if (hasWallet) {
    const wallet = getKeypairFromPrivateKey(profile.walletPrivateKey);
    const balance = await getConnection().getBalance(wallet.publicKey);
    amountLamports = resolveBuyLamports(balance, profile);
  } else {
    amountLamports = minLamports;
  }

  const base = {
    mint,
    profileUserId: profile.userId,
    buyFraction: profile.buyFraction,
    walletAddress,
  };

  if (amountLamports < minLamports) {
    return {
      status: "skipped",
      solSpent: 0,
      reason: `spendable ${amountLamports / LAMPORTS_PER_SOL} SOL below min ${config.minBuySol}`,
      latencyMs: Date.now() - startedAt,
      ...base,
    };
  }

  const quote = await fetchQuote(mint, amountLamports);
  const solSpent = amountLamports / LAMPORTS_PER_SOL;
  const outAmount = String(quote.outAmount ?? "0");

  if (config.dryRun) {
    return {
      status: "dry_run",
      solSpent,
      outAmount,
      latencyMs: Date.now() - startedAt,
      ...base,
    };
  }

  const wallet = getKeypairFromPrivateKey(profile.walletPrivateKey);
  const connection = getConnection();
  const swapB64 = await fetchSwapTransaction(quote, wallet.publicKey.toBase58());
  const tx = VersionedTransaction.deserialize(Buffer.from(swapB64, "base64"));
  tx.sign([wallet]);

  const txSignature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3,
  });
  const confirmation = await connection.confirmTransaction(txSignature, "confirmed");
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  const sweep = await sweepTokenToDest(mint, wallet);

  return {
    status: "bought",
    solSpent,
    outAmount,
    txSignature,
    sweep,
    latencyMs: Date.now() - startedAt,
    ...base,
  };
}

/** Primary wallet buy — convenience wrapper for scripts. */
export async function buyAllSol(mint: string): Promise<BuyResult> {
  const { loadWatchProfiles } = await import("../watch-profiles.js");
  const primary = loadWatchProfiles()[0];
  if (!primary) throw new Error("No watch profiles configured");
  return buyForProfile(mint, primary);
}
