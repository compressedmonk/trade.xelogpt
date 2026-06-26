import { VersionedTransaction } from "@solana/web3.js";
import { isValidSolanaAddress } from "@/lib/token-map";
import { getConnection, getTradingKeypair } from "@/lib/solana-wallet";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_URL = "https://quote-api.jup.ag/v6/swap";

export interface SwapBuyResult {
  txSignature: string;
  outAmount: string;
}

function jupiterHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.JUPITER_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

function getBuyAmountSol(): number {
  const raw = process.env.KOL_COPY_TRADE_BUY_SOL ?? "0.05";
  const amount = parseFloat(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("KOL_COPY_TRADE_BUY_SOL must be a positive number");
  }
  if (amount > 10) {
    throw new Error("KOL_COPY_TRADE_BUY_SOL exceeds safety limit of 10 SOL");
  }
  return amount;
}

function getDefaultSlippageBps(): number {
  const raw = process.env.KOL_COPY_TRADE_SLIPPAGE_BPS ?? "50";
  const bps = parseInt(raw, 10);
  return Number.isFinite(bps) && bps > 0 ? bps : 50;
}

async function fetchQuote(
  outputMint: string,
  amountLamports: number,
  slippageBps: number,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint,
    amount: String(amountLamports),
    slippageBps: String(slippageBps),
  });

  const res = await fetch(`${JUPITER_QUOTE_URL}?${params}`, {
    headers: jupiterHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
  }

  const quote = await res.json();
  if (quote.error) {
    throw new Error(`Jupiter quote error: ${quote.error}`);
  }
  return quote;
}

async function fetchSwapTransaction(
  quoteResponse: Record<string, unknown>,
  userPublicKey: string,
): Promise<string> {
  const res = await fetch(JUPITER_SWAP_URL, {
    method: "POST",
    headers: { ...jupiterHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
      prioritizationFeeLamports: 5000,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Jupiter swap build failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Jupiter swap error: ${data.error}`);
  }
  if (!data.swapTransaction) {
    throw new Error("Jupiter swap response missing swapTransaction");
  }
  return data.swapTransaction as string;
}

export async function executeSolBuy(
  tokenMint: string,
  amountSol?: number,
  slippageBps?: number,
): Promise<SwapBuyResult> {
  if (!isValidSolanaAddress(tokenMint)) {
    throw new Error(`Invalid token mint: ${tokenMint}`);
  }
  if (tokenMint === SOL_MINT) {
    throw new Error("Cannot buy SOL with SOL");
  }

  const buySol = amountSol ?? getBuyAmountSol();
  const slippage = slippageBps ?? getDefaultSlippageBps();
  const amountLamports = Math.floor(buySol * 1e9);

  const wallet = getTradingKeypair();
  const connection = getConnection();

  const quote = await fetchQuote(tokenMint, amountLamports, slippage);
  const swapTransactionB64 = await fetchSwapTransaction(quote, wallet.publicKey.toBase58());

  const txBytes = Buffer.from(swapTransactionB64, "base64");
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([wallet]);

  const txSignature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  const confirmation = await connection.confirmTransaction(txSignature, "confirmed");
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return {
    txSignature,
    outAmount: String(quote.outAmount ?? "0"),
  };
}
