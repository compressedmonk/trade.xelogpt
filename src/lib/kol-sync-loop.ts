import { syncKolMentions } from "@/lib/kol-feed";
import { classifyPendingPosts } from "@/lib/kol-sentiment-classifier";

let syncRunning = false;
let lastSyncAt: Date | null = null;
let lastSyncResult: {
  classified: number;
  failed: number;
} | null = null;

export function isKolSyncEnabled(): boolean {
  return process.env.KOL_SYNC_ENABLED !== "false";
}

export function getSyncIntervalMs(): number {
  const raw = parseInt(process.env.KOL_SYNC_POLL_MS ?? "60000", 10);
  return Number.isFinite(raw) && raw >= 15000 ? raw : 60000;
}

export function getSyncStatus() {
  return {
    enabled: isKolSyncEnabled(),
    pollIntervalMs: getSyncIntervalMs(),
    syncRunning,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    lastSyncResult,
    twitterConfigured: Boolean(process.env.TWITTER_BEARER_TOKEN),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    sentimentModel: process.env.KOL_SENTIMENT_MODEL ?? "o3",
  };
}

export async function runKolSyncCycle(): Promise<{ classified: number; failed: number }> {
  if (syncRunning) return lastSyncResult ?? { classified: 0, failed: 0 };

  syncRunning = true;
  try {
    await syncKolMentions();
    const result = await classifyPendingPosts(20);
    const { checkAndSendSurgeAlert } = await import("@/lib/kol-sentiment-alerts");
    await checkAndSendSurgeAlert().catch((err) => {
      console.error("[kol-sync] surge alert failed:", err);
    });
    lastSyncAt = new Date();
    lastSyncResult = result;
    return result;
  } finally {
    syncRunning = false;
  }
}

export function startKolSyncLoop(): void {
  if (!isKolSyncEnabled()) {
    console.log("[kol-sync] disabled (KOL_SYNC_ENABLED=false)");
    return;
  }

  const intervalMs = getSyncIntervalMs();
  console.log(`[kol-sync] starting poll+classify loop every ${intervalMs}ms`);

  void runKolSyncCycle().catch((err) => {
    console.error("[kol-sync] initial cycle failed:", err);
  });

  setInterval(() => {
    void runKolSyncCycle().catch((err) => {
      console.error("[kol-sync] cycle failed:", err);
    });
  }, intervalMs);
}
