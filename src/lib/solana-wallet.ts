import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

let connection: Connection | null = null;
let tradingKeypair: Keypair | null = null;

export function isSolanaConfigured(): boolean {
  return Boolean(process.env.SOLANA_RPC_URL && process.env.TRADING_WALLET_PRIVATE_KEY);
}

export function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error("SOLANA_RPC_URL not configured");
  if (!connection) {
    connection = new Connection(rpcUrl, "confirmed");
  }
  return connection;
}

export function getTradingKeypair(): Keypair {
  if (tradingKeypair) return tradingKeypair;

  const secret = process.env.TRADING_WALLET_PRIVATE_KEY;
  if (!secret) throw new Error("TRADING_WALLET_PRIVATE_KEY not configured");

  try {
    tradingKeypair = Keypair.fromSecretKey(bs58.decode(secret.trim()));
  } catch {
    throw new Error("TRADING_WALLET_PRIVATE_KEY must be a valid base58 secret key");
  }
  return tradingKeypair;
}

export function getTradingWalletAddress(): string {
  return getTradingKeypair().publicKey.toBase58();
}
