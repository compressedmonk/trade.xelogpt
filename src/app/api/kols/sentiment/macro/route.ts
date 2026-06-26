import { NextResponse } from "next/server";
import { computeMacroSentiment } from "@/lib/kol-sentiment-index";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await computeMacroSentiment();
  return NextResponse.json(result);
}
