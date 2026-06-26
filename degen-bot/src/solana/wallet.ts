import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "../config.js";

let connection: Connection | null = null;
const keypairCache = new Map<string, Keypair>();

export function getConnection(): Connection {
  if (!config.rpcUrl) throw new Error("SOLANA_RPC_URL not configured");
  if (!connection) {
    connection = new Connection(config.rpcUrl, "confirmed");
  }
  return connection;
}

export function getKeypairFromPrivateKey(privateKey: string): Keypair {
  const trimmed = privateKey.trim();
  if (!trimmed) throw new Error("Wallet private key is empty");

  const cached = keypairCache.get(trimmed);
  if (cached) return cached;

  try {
    const kp = Keypair.fromSecretKey(bs58.decode(trimmed));
    keypairCache.set(trimmed, kp);
    return kp;
  } catch {
    throw new Error("Wallet private key must be a valid base58 secret key");
  }
}

/** Primary bot wallet (backward compatible). */
export function getKeypair(): Keypair {
  if (!config.walletPrivateKey) throw new Error("DEGEN_WALLET_PRIVATE_KEY not configured");
  return getKeypairFromPrivateKey(config.walletPrivateKey);
}

export function getWalletAddress(): string {
  return getKeypair().publicKey.toBase58();
}

export function getWalletAddressFromPrivateKey(privateKey: string): string {
  return getKeypairFromPrivateKey(privateKey).publicKey.toBase58();
}
