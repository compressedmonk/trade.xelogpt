import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const configs = await prisma.copyTradeConfig.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(configs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { walletAddress, label, maxPositionSol, slippage, autoTp, autoSl } = body;

  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
  }

  const config = await prisma.copyTradeConfig.upsert({
    where: { walletAddress_chain: { walletAddress, chain: "sol" } },
    update: { label, maxPositionSol, slippage, autoTp, autoSl, enabled: true },
    create: {
      walletAddress,
      chain: "sol",
      label: label ?? walletAddress.slice(0, 8),
      maxPositionSol: maxPositionSol ?? 0.1,
      slippage: slippage ?? 0.5,
      autoTp,
      autoSl,
    },
  });

  return NextResponse.json(config);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await prisma.copyTradeConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;
  const config = await prisma.copyTradeConfig.update({ where: { id }, data });
  return NextResponse.json(config);
}
