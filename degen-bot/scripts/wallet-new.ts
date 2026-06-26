import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const writeEnv = process.argv.includes("--write-env");
const envPath = resolve(process.cwd(), ".env");

const kp = Keypair.generate();
const address = kp.publicKey.toBase58();
const secret = bs58.encode(kp.secretKey);

console.log("New Solana wallet");
console.log(`Address:     ${address}`);
console.log(`Private key: ${secret}`);
console.log("");
console.log("Fund this address with SOL before LIVE trading.");
console.log(`Gas reserve (untouched): check DEGEN_GAS_RESERVE_SOL in .env`);

if (writeEnv) {
  let env = readFileSync(envPath, "utf8");
  if (/^DEGEN_WALLET_PRIVATE_KEY=/m.test(env)) {
    env = env.replace(/^DEGEN_WALLET_PRIVATE_KEY=.*/m, `DEGEN_WALLET_PRIVATE_KEY=${secret}`);
  } else {
    env += `\nDEGEN_WALLET_PRIVATE_KEY=${secret}\n`;
  }
  writeFileSync(envPath, env, { mode: 0o600 });
  console.log(`\nWrote DEGEN_WALLET_PRIVATE_KEY to ${envPath}`);
}
