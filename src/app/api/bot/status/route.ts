import { NextResponse } from "next/server";
import { getBotStatus } from "@/lib/kol-copy-trader";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getBotStatus();

  const recentLogs = await prisma.tradeLog.findMany({
    where: { source: "kol_copy" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      tokenAddress: true,
      tokenSymbol: true,
      side: true,
      amountSol: true,
      status: true,
      txSignature: true,
      triggeredBy: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ...status, recentLogs });
}
