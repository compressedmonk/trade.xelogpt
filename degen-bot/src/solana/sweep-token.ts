import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  Transaction,
  type ConfirmOptions,
} from "@solana/web3.js";
import { config } from "../config.js";
import { getConnection } from "./wallet.js";

export interface SweepResult {
  status: "swept" | "skipped";
  mint: string;
  amount: string;
  destWallet: string;
  txSignature?: string;
  reason?: string;
}

function tokenProgramForMint(owner: PublicKey): PublicKey {
  return owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

/**
 * Sends the bot wallet's full SPL balance for `mint` to DEGEN_DEST_WALLET.
 * Creates the destination ATA if needed. No-op when dest wallet is unset.
 */
export async function sweepTokenToDest(mint: string, owner: Keypair): Promise<SweepResult | null> {
  const dest = config.destWallet.trim();
  if (!dest) return null;

  const connection = getConnection();
  const mintPk = new PublicKey(mint);
  const destPk = new PublicKey(dest);

  const mintInfo = await connection.getAccountInfo(mintPk);
  if (!mintInfo) {
    return { status: "skipped", mint, amount: "0", destWallet: dest, reason: "mint not found" };
  }

  const tokenProgram = tokenProgramForMint(mintInfo.owner);
  const sourceAta = getAssociatedTokenAddressSync(mintPk, owner.publicKey, false, tokenProgram);
  const destAta = getAssociatedTokenAddressSync(mintPk, destPk, false, tokenProgram);

  let amount: bigint;
  try {
    const source = await getAccount(connection, sourceAta, undefined, tokenProgram);
    amount = source.amount;
  } catch {
    return { status: "skipped", mint, amount: "0", destWallet: dest, reason: "no token account" };
  }

  if (amount === 0n) {
    return { status: "skipped", mint, amount: "0", destWallet: dest, reason: "zero balance" };
  }

  const instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      owner.publicKey,
      destAta,
      destPk,
      mintPk,
      tokenProgram,
    ),
    createTransferInstruction(sourceAta, destAta, owner.publicKey, amount, [], tokenProgram),
  ];

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction().add(...instructions);
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = blockhash;
  tx.sign(owner);

  const txSignature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const confirm: ConfirmOptions = { commitment: "confirmed" };
  const confirmation = await connection.confirmTransaction(
    { signature: txSignature, blockhash, lastValidBlockHeight },
    confirm.commitment,
  );
  if (confirmation.value.err) {
    throw new Error(`Sweep failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return {
    status: "swept",
    mint,
    amount: amount.toString(),
    destWallet: dest,
    txSignature,
  };
}
