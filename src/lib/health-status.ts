import crypto from "crypto";
import os from "os";
import { getBotStatus } from "@/lib/kol-copy-trader";
import { getSyncStatus } from "@/lib/kol-sync-loop";
import { prisma } from "@/lib/prisma";
import { getTelegramBotToken, isTelegramConfigured } from "@/lib/telegram";

export type HealthLevel = "ok" | "warn" | "error" | "off";

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface ServiceProbe {
  configured: boolean;
  status: HealthLevel;
  latencyMs: number | null;
  message: string | null;
  rateLimit?: RateLimitInfo;
  balance?: {
    available: number | null;
    used: number | null;
    granted: number | null;
    currency: string;
  };
}

export interface HealthSnapshot {
  checkedAt: string;
  server: {
    uptimeSec: number;
    loadAvg: [number, number, number];
    cpuCount: number;
    loadPct: number;
    memory: {
      usedMb: number;
      totalMb: number;
      usedPct: number;
    };
    process: {
      rssMb: number;
      heapUsedMb: number;
    };
  };
  database: {
    status: HealthLevel;
    latencyMs: number;
    kolProfiles: number;
    pendingClassifications: number;
  };
  twitter: ServiceProbe;
  openai: ServiceProbe & { model: string | null };
  gmgn: ServiceProbe;
  telegram: ServiceProbe;
  kolSync: ReturnType<typeof getSyncStatus>;
  kolBot: ReturnType<typeof getBotStatus>;
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get("x-rate-limit-limit");
  const remaining = headers.get("x-rate-limit-remaining");
  const reset = headers.get("x-rate-limit-reset");
  if (!limit || !remaining || !reset) return undefined;
  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt: new Date(parseInt(reset, 10) * 1000).toISOString(),
  };
}

async function probeTwitter(): Promise<ServiceProbe> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return { configured: false, status: "off", latencyMs: null, message: "TWITTER_BEARER_TOKEN nincs beállítva" };
  }

  const start = Date.now();
  try {
    const res = await fetch("https://api.x.com/2/users/by/username/twitter?user.fields=username", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const latencyMs = Date.now() - start;
    const rateLimit = parseRateLimitHeaders(res.headers);

    if (!res.ok) {
      const body = await res.text();
      return {
        configured: true,
        status: res.status === 429 ? "warn" : "error",
        latencyMs,
        message: `HTTP ${res.status}: ${body.slice(0, 120)}`,
        rateLimit,
      };
    }

    const remaining = rateLimit?.remaining ?? null;
    const limit = rateLimit?.limit ?? null;
    let status: HealthLevel = "ok";
    if (remaining != null && limit != null && limit > 0) {
      const pct = remaining / limit;
      if (pct <= 0.05) status = "error";
      else if (pct <= 0.2) status = "warn";
    }

    return {
      configured: true,
      status,
      latencyMs,
      message: rateLimit
        ? `${rateLimit.remaining} / ${rateLimit.limit} kérés maradt`
        : "API elérhető",
      rateLimit,
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Ismeretlen hiba",
    };
  }
}

async function probeOpenAI(): Promise<ServiceProbe & { model: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  const model = process.env.KOL_SENTIMENT_MODEL ?? "o3";

  if (!apiKey) {
    return {
      configured: false,
      status: "off",
      latencyMs: null,
      message: "OPENAI_API_KEY nincs beállítva",
      model: null,
    };
  }

  const start = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text();
      return {
        configured: true,
        status: "error",
        latencyMs,
        message: `HTTP ${res.status}: ${body.slice(0, 120)}`,
        model,
      };
    }

    let balance: ServiceProbe["balance"];
    let balanceNote: string | null = null;

    if (adminKey) {
      try {
        const creditsRes = await fetch("https://api.openai.com/v1/organization/credits", {
          headers: { Authorization: `Bearer ${adminKey}` },
          cache: "no-store",
        });
        if (creditsRes.ok) {
          const credits = (await creditsRes.json()) as {
            total_available?: number;
            total_used?: number;
            total_granted?: number;
          };
          balance = {
            available: credits.total_available ?? null,
            used: credits.total_used ?? null,
            granted: credits.total_granted ?? null,
            currency: "USD",
          };
          balanceNote = null;
        } else {
          const startTime = Math.floor(Date.now() / 1000) - 86400 * 30;
          const costsRes = await fetch(
            `https://api.openai.com/v1/organization/costs?start_time=${startTime}&limit=31`,
            { headers: { Authorization: `Bearer ${adminKey}` }, cache: "no-store" },
          );
          if (costsRes.ok) {
            const costs = (await costsRes.json()) as {
              data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>;
            };
            let totalCents = 0;
            for (const bucket of costs.data ?? []) {
              for (const row of bucket.results ?? []) {
                totalCents += row.amount?.value ?? 0;
              }
            }
            const totalUsd = totalCents / 100;
            balance = {
              available: null,
              used: totalUsd,
              granted: null,
              currency: "USD",
            };
            balanceNote = `30 napi költség: $${totalUsd.toFixed(2)} (egyenleg csak dashboardon)`;
          } else {
            balanceNote = "Admin kulcs nem adott billing infót";
          }
        }
      } catch {
        balanceNote = "Billing lekérés sikertelen";
      }
    } else {
      balanceNote = "Egyenleghez OPENAI_ADMIN_KEY kell";
    }

    let status: HealthLevel = "ok";
    if (balance?.available != null && balance.available < 5) status = "warn";
    if (balance?.available != null && balance.available <= 0) status = "error";

    return {
      configured: true,
      status,
      latencyMs,
      message: balanceNote ?? "API elérhető",
      balance,
      model,
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Ismeretlen hiba",
      model,
    };
  }
}

async function probeGmgn(): Promise<ServiceProbe> {
  const apiKey = process.env.GMGN_API_KEY;
  if (!apiKey) {
    return { configured: false, status: "off", latencyMs: null, message: "GMGN_API_KEY nincs beállítva" };
  }

  const start = Date.now();
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const url = new URL("https://openapi.gmgn.ai/v1/token/info");
    url.searchParams.set("chain", "sol");
    url.searchParams.set("address", "So11111111111111111111111111111111111111112");
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("client_id", crypto.randomUUID());

    const res = await fetch(url.toString(), {
      headers: { "X-APIKEY": apiKey, "Content-Type": "application/json" },
      cache: "no-store",
    });
    const latencyMs = Date.now() - start;
    const json = await res.json();

    if (!res.ok || json.code !== 0) {
      return {
        configured: true,
        status: "error",
        latencyMs,
        message: json.error ?? json.message ?? `HTTP ${res.status}`,
      };
    }

    return {
      configured: true,
      status: latencyMs > 3000 ? "warn" : "ok",
      latencyMs,
      message: "API elérhető",
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Ismeretlen hiba",
    };
  }
}

async function probeTelegram(): Promise<ServiceProbe> {
  const token = getTelegramBotToken();
  if (!isTelegramConfigured()) {
    return {
      configured: false,
      status: "off",
      latencyMs: null,
      message: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID nincs beállítva (degen-bot/.env fallback)",
    };
  }

  const start = Date.now();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
    const latencyMs = Date.now() - start;
    const json = await res.json();

    if (!res.ok || !json.ok) {
      return {
        configured: true,
        status: "error",
        latencyMs,
        message: json.description ?? `HTTP ${res.status}`,
      };
    }

    return {
      configured: true,
      status: "ok",
      latencyMs,
      message: `@${json.result?.username ?? "bot"} aktív`,
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Ismeretlen hiba",
    };
  }
}

export async function collectHealthSnapshot(): Promise<HealthSnapshot> {
  const dbStart = Date.now();
  let dbStatus: HealthLevel = "ok";
  let kolProfiles = 0;
  let pendingClassifications = 0;

  try {
    await prisma.$queryRaw`SELECT 1`;
    kolProfiles = await prisma.kolProfile.count();
    pendingClassifications = await prisma.kolMentionCache.count({
      where: { classificationStatus: "pending" },
    });
  } catch {
    dbStatus = "error";
  }
  const dbLatencyMs = Date.now() - dbStart;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = Math.round((usedMem / totalMem) * 100);
  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg();
  const loadPct = Math.round((loadAvg[0] / Math.max(cpuCount, 1)) * 100);
  const proc = process.memoryUsage();

  const [twitter, openai, gmgn, telegram] = await Promise.all([
    probeTwitter(),
    probeOpenAI(),
    probeGmgn(),
    probeTelegram(),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    server: {
      uptimeSec: Math.floor(os.uptime()),
      loadAvg: [loadAvg[0], loadAvg[1], loadAvg[2]] as [number, number, number],
      cpuCount,
      loadPct,
      memory: {
        usedMb: Math.round(usedMem / 1024 / 1024),
        totalMb: Math.round(totalMem / 1024 / 1024),
        usedPct: memPct,
      },
      process: {
        rssMb: Math.round(proc.rss / 1024 / 1024),
        heapUsedMb: Math.round(proc.heapUsed / 1024 / 1024),
      },
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      kolProfiles,
      pendingClassifications,
    },
    twitter,
    openai,
    gmgn,
    telegram,
    kolSync: getSyncStatus(),
    kolBot: getBotStatus(),
  };
}
