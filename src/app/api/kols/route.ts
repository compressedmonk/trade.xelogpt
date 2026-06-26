import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import { resolveWalletFromGmgn } from "@/lib/kol-resolve";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const profileTypeParam = req.nextUrl.searchParams.get("profileType");
  const profileType =
    profileTypeParam === "newsmaker" || profileTypeParam === "trader"
      ? profileTypeParam
      : undefined;
  const profiles = await prisma.kolProfile.findMany({
    where: profileType ? { profileType } : undefined,
    include: { wallets: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { twitterUsername, wallets, autoResolve, profileType, sentimentWeight } = body;

  if (!twitterUsername) {
    return NextResponse.json({ error: "twitterUsername required" }, { status: 400 });
  }

  const normalized = normalizeTwitterUsername(twitterUsername);
  let walletList: string[] = Array.isArray(wallets) ? wallets : [];
  const type = profileType === "newsmaker" ? "newsmaker" : "trader";
  const weight = typeof sentimentWeight === "number" && sentimentWeight > 0 ? sentimentWeight : 1.0;

  if (walletList.length === 0 && autoResolve !== false && type !== "newsmaker") {
    const resolved = await resolveWalletFromGmgn(normalized);
    if (resolved) walletList = [resolved];
  }

  const profile = await prisma.kolProfile.upsert({
    where: { twitterUsername: normalized },
    update: { enabled: true, profileType: type, sentimentWeight: weight },
    create: {
      twitterUsername: normalized,
      profileType: type,
      sentimentWeight: weight,
    },
    include: { wallets: true },
  });

  for (const addr of walletList) {
    const walletAddress = String(addr).trim();
    if (!walletAddress) continue;
    await prisma.kolWallet.upsert({
      where: {
        kolProfileId_walletAddress_chain: {
          kolProfileId: profile.id,
          walletAddress,
          chain: "sol",
        },
      },
      update: {},
      create: {
        kolProfileId: profile.id,
        walletAddress,
        chain: "sol",
        label: walletList.length > 1 ? "cluster" : "main",
      },
    });
  }

  const updated = await prisma.kolProfile.findUnique({
    where: { id: profile.id },
    include: { wallets: true },
  });

  return NextResponse.json(updated);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, enabled, addWallet, removeWalletId, label } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (enabled !== undefined) {
    await prisma.kolProfile.update({ where: { id }, data: { enabled } });
  }

  if (addWallet) {
    await prisma.kolWallet.create({
      data: {
        kolProfileId: id,
        walletAddress: addWallet,
        chain: "sol",
        label: label ?? "cluster",
      },
    });
  }

  if (removeWalletId) {
    await prisma.kolWallet.delete({ where: { id: removeWalletId } });
  }

  const updated = await prisma.kolProfile.findUnique({
    where: { id },
    include: { wallets: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.kolProfile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
