import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSessionToken,
  verifyPassword,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Túl sok próbálkozás. Próbáld újra később." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } }
    );
  }

  let password: string;
  try {
    const body = await req.json();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Érvénytelen kérés." }, { status: 400 });
  }

  if (!password || !verifyPassword(password)) {
    return NextResponse.json({ error: "Hibás jelszó." }, { status: 401 });
  }

  resetRateLimit(ip);
  const token = await createSessionToken();
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions());

  return NextResponse.json({ ok: true });
}
