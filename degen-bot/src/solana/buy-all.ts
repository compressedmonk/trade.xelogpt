import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config.js";
import { getConnection, getKeypair } from "./wallet.js";
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

/**
 * Spends the wallet's entire SOL balance (minus the gas reserve) on `mint` via
 * Jupiter. In DRY_RUN it fetches a quote only — no signing or broadcast. When no
 * wallet key is configured (dry-run dev), it previews using DEGEN_MIN_BUY_SOL.
 */
export async function buyAllSol(mint: string): Promise<BuyResult> {
  const startedAt = Date.now();
  const reserveLamports = Math.floor(config.gasReserveSol * LAMPORTS_PER_SOL);
  const minLamports = Math.floor(config.minBuySol * LAMPORTS_PER_SOL);
  const hasWallet = Boolean(config.walletPrivateKey);

  let spendableLamports: number;
  if (hasWallet) {
    const balance = await getConnection().getBalance(getKeypair().publicKey);
    spendableLamports = balance - reserveLamports;
  } else {
    // No wallet (dry-run preview): use the configured minimum as a nominal size.
    spendableLamports = minLamports;
  }

  if (spendableLamports < minLamports) {
    return {
      status: "skipped",
      mint,
      solSpent: 0,
      reason: `spendable ${spendableLamports / LAMPORTS_PER_SOL} SOL below min ${config.minBuySol}`,
      latencyMs: Date.now() - startedAt,
    };
  }

  const quote = await fetchQuote(mint, spendableLamports);
  const solSpent = spendableLamports / LAMPORTS_PER_SOL;
  const outAmount = String(quote.outAmount ?? "0");

  if (config.dryRun) {
    return {
      status: "dry_run",
      mint,
      solSpent,
      outAmount,
      latencyMs: Date.now() - startedAt,
    };
  }

  const wallet = getKeypair();
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

  const sweep = await sweepTokenToDest(mint);

  return {
    status: "bought",
    mint,
    solSpent,
    outAmount,
    txSignature,
    sweep,
    latencyMs: Date.now() - startedAt,
  };
}
