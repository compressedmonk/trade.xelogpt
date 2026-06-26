import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeTwitterUsername } from "@/lib/mention-parser";
import { NEWSMAKER_SEED } from "@/lib/newsmaker-seed";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ newsmakers: NEWSMAKER_SEED });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const usernames: string[] = Array.isArray(body.twitterUsernames)
    ? body.twitterUsernames
    : body.all
      ? NEWSMAKER_SEED.map((s) => s.twitterUsername)
      : [];

  let imported = 0;
  for (const raw of usernames) {
    const seed = NEWSMAKER_SEED.find(
      (s) => s.twitterUsername === normalizeTwitterUsername(raw),
    );
    const normalized = normalizeTwitterUsername(raw);
    if (!normalized) continue;

    await prisma.kolProfile.upsert({
      where: { twitterUsername: normalized },
      update: {
        enabled: true,
        profileType: "newsmaker",
        sentimentWeight: seed?.sentimentWeight ?? 1.0,
        displayName: seed?.displayName,
      },
      create: {
        twitterUsername: normalized,
        displayName: seed?.displayName,
        profileType: "newsmaker",
        sentimentWeight: seed?.sentimentWeight ?? 1.0,
      },
    });
    imported++;
  }

  return NextResponse.json({ imported });
}
