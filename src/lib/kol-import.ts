import { prisma } from "@/lib/prisma";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import {
  SOLANA_KOL_WALLET_SEED,
  type WalletSeedKol,
} from "@/lib/solana-kol-wallet-seed";

export async function upsertKolWithWallet(
  twitterUsername: string,
  displayName: string | null,
  walletAddress: string,
): Promise<void> {
  const normalized = normalizeTwitterUsername(twitterUsername);
  const wallet = walletAddress.trim();

  const profile = await prisma.kolProfile.upsert({
    where: { twitterUsername: normalized },
    update: {
      enabled: true,
      ...(displayName ? { displayName } : {}),
    },
    create: {
      twitterUsername: normalized,
      displayName,
      enabled: true,
    },
  });

  await prisma.kolWallet.upsert({
    where: {
      kolProfileId_walletAddress_chain: {
        kolProfileId: profile.id,
        walletAddress: wallet,
        chain: "sol",
      },
    },
    update: { label: "main" },
    create: {
      kolProfileId: profile.id,
      walletAddress: wallet,
      chain: "sol",
      label: "main",
    },
  });
}

export async function importWalletSeedKols(
  entries?: WalletSeedKol[],
): Promise<{ imported: number; total: number }> {
  const list = entries ?? SOLANA_KOL_WALLET_SEED;
  let imported = 0;

  for (const entry of list) {
    await upsertKolWithWallet(entry.twitterUsername, entry.displayName, entry.walletAddress);
    imported++;
  }

  return { imported, total: list.length };
}

export async function getWalletSeedStatus(): Promise<
  Array<WalletSeedKol & { alreadyAdded: boolean }>
> {
  const added = new Set(
    (await prisma.kolProfile.findMany({ select: { twitterUsername: true } })).map((p) =>
      normalizeTwitterUsername(p.twitterUsername),
    ),
  );

  return SOLANA_KOL_WALLET_SEED.map((entry) => ({
    ...entry,
    twitterUsername: normalizeTwitterUsername(entry.twitterUsername),
    alreadyAdded: added.has(normalizeTwitterUsername(entry.twitterUsername)),
  }));
}
