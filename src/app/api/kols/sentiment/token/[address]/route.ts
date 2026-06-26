import { NextRequest, NextResponse } from "next/server";
import { computeTokenSentiment } from "@/lib/kol-sentiment-index";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } },
) {
  const result = await computeTokenSentiment(params.address);
  return NextResponse.json(result);
}
