import { NextRequest, NextResponse } from "next/server";
import { executeSwap, queryOrder } from "@/lib/gmgn-signer";
import { prisma } from "@/lib/prisma";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenAddress, tokenSymbol, side, amountSol, fromAddress, slippage, triggeredBy } = body;

    if (!tokenAddress || !fromAddress || !amountSol) {
      return NextResponse.json({ error: "tokenAddress, fromAddress, amountSol required" }, { status: 400 });
    }

    const isBuy = side === "buy";
    const inputToken = isBuy ? SOL_MINT : tokenAddress;
    const outputToken = isBuy ? tokenAddress : SOL_MINT;
    const inputAmount = String(Math.floor(amountSol * 1e9));

    const log = await prisma.tradeLog.create({
      data: {
        chain: "sol",
        tokenAddress,
        tokenSymbol: tokenSymbol ?? "?",
        side: side ?? "buy",
        amountSol,
        status: "pending",
        source: "copy_trade",
        triggeredBy,
      },
    });

    try {
      const result: any = await executeSwap({
        chain: "sol",
        from_address: fromAddress,
        input_token: inputToken,
        output_token: outputToken,
        input_amount: inputAmount,
        slippage: slippage ?? 0.5,
        anti_mev: true,
        priority_fee: 0.0001,
      });

      await prisma.tradeLog.update({
        where: { id: log.id },
        data: {
          orderId: result?.order_id ?? result?.id,
          status: "submitted",
        },
      });

      return NextResponse.json({ ok: true, orderId: result?.order_id, logId: log.id });
    } catch (swapErr: any) {
      await prisma.tradeLog.update({
        where: { id: log.id },
        data: { status: "failed" },
      });
      return NextResponse.json({ error: swapErr.message, logId: log.id }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
