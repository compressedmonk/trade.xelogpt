import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "../config.js";

let connection: Connection | null = null;
let keypair: Keypair | null = null;

export function getConnection(): Connection {
  if (!config.rpcUrl) throw new Error("SOLANA_RPC_URL not configured");
  if (!connection) {
    connection = new Connection(config.rpcUrl, "confirmed");
  }
  return connection;
}

export function getKeypair(): Keypair {
  if (keypair) return keypair;
  if (!config.walletPrivateKey) throw new Error("DEGEN_WALLET_PRIVATE_KEY not configured");
  try {
    keypair = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey.trim()));
  } catch {
    throw new Error("DEGEN_WALLET_PRIVATE_KEY must be a valid base58 secret key");
  }
  return keypair;
}

export function getWalletAddress(): string {
  return getKeypair().publicKey.toBase58();
}
