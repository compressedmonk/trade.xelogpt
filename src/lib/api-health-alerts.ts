import { probeOpenAI, probeTwitter, type HealthLevel, type ServiceProbe } from "@/lib/health-status";
import { isTelegramConfigured, sendMessage } from "@/lib/telegram";

const lastAlertAt = new Map<string, number>();
const lastStatus = new Map<string, HealthLevel>();

export function isApiHealthAlertEnabled(): boolean {
  return process.env.API_HEALTH_ALERT_ENABLED !== "false";
}

function getAlertCooldownMs(): number {
  const raw = parseInt(process.env.API_HEALTH_ALERT_COOLDOWN_MS ?? "1800000", 10);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 1_800_000;
}

export function getApiHealthCheckIntervalMs(): number {
  const raw = parseInt(process.env.API_HEALTH_CHECK_MS ?? "300000", 10);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 300_000;
}

const SERVICE_LABELS: Record<string, string> = {
  twitter: "X (Twitter) API",
  openai: "OpenAI API",
};

function formatFailureAlert(service: string, probe: ServiceProbe): string {
  const label = SERVICE_LABELS[service] ?? service;
  const severity = probe.status === "error" ? "HIBA" : "FIGYELEM";
  const lines = [
    `<b>⚠️ API ${severity}: ${label}</b>`,
    "",
    probe.message ?? "Nincs válasz / ismeretlen hiba",
  ];
  if (probe.rateLimit) {
    lines.push(
      "",
      `Rate limit: ${probe.rateLimit.remaining} / ${probe.rateLimit.limit}`,
    );
  }
  lines.push("", `<a href="https://trade.xelogpt.com/health">Státusz dashboard</a>`);
  return lines.join("\n");
}

function formatRecoveryAlert(service: string, probe: ServiceProbe): string {
  const label = SERVICE_LABELS[service] ?? service;
  return [
    `<b>✅ ${label} újra elérhető</b>`,
    "",
    probe.message ?? "OK",
    "",
    `<a href="https://trade.xelogpt.com/health">Státusz dashboard</a>`,
  ].join("\n");
}

async function maybeAlert(service: string, probe: ServiceProbe): Promise<boolean> {
  if (!probe.configured) return false;

  const prev = lastStatus.get(service);
  const cur = probe.status;
  lastStatus.set(service, cur);

  const isBad = cur === "error" || cur === "warn";
  const wasBad = prev === "error" || prev === "warn";

  if (isBad) {
    const cooldown = getAlertCooldownMs();
    const last = lastAlertAt.get(service) ?? 0;
    if (Date.now() - last < cooldown) return false;

    const sent = await sendMessage(formatFailureAlert(service, probe));
    if (sent) {
      lastAlertAt.set(service, Date.now());
      console.log(`[api-health] alert sent: ${service} (${cur})`);
    }
    return sent;
  }

  if (wasBad && cur === "ok") {
    const sent = await sendMessage(formatRecoveryAlert(service, probe));
    if (sent) console.log(`[api-health] recovery alert sent: ${service}`);
    return sent;
  }

  return false;
}

export async function checkAndSendApiHealthAlerts(): Promise<void> {
  if (!isApiHealthAlertEnabled() || !isTelegramConfigured()) return;

  const [twitter, openai] = await Promise.all([probeTwitter(), probeOpenAI()]);
  await maybeAlert("twitter", twitter);
  await maybeAlert("openai", openai);
}

export function startApiHealthAlertLoop(): void {
  if (!isApiHealthAlertEnabled()) {
    console.log("[api-health] disabled (API_HEALTH_ALERT_ENABLED=false)");
    return;
  }

  const intervalMs = getApiHealthCheckIntervalMs();
  console.log(`[api-health] starting check+alert loop every ${intervalMs}ms`);

  void checkAndSendApiHealthAlerts().catch((err) => {
    console.error("[api-health] initial check failed:", err);
  });

  setInterval(() => {
    void checkAndSendApiHealthAlerts().catch((err) => {
      console.error("[api-health] check failed:", err);
    });
  }, intervalMs);
}
