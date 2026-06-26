import type { Page } from "playwright";
import { channelUrl, config } from "../config.js";
import { findAlertsChannel, parseGuildChannels } from "./guild-channels.js";

/** Normalize Discord UI quirks: fullwidth pipe, extra whitespace. */
export function normalizeChannelLabel(name: string): string {
  return name.replace(/\uFF5C/g, "|").replace(/\s+/g, " ").trim();
}

/**
 * Wealth Group #trades = "🚀 | trades" (ASCII or fullwidth ｜ pipe)
 * NOT: stocks, stock-trade, announcements, active-*
 */
export function isTradesChannelName(name: string): boolean {
  const normalized = normalizeChannelLabel(name);
  const lower = normalized.toLowerCase();

  if (/\bstock/i.test(lower)) return false;
  if (/\bstocks\b/i.test(lower)) return false;
  if (/active/i.test(lower)) return false;
  if (/futures/i.test(lower)) return false;
  if (/announcement/i.test(lower)) return false;
  if (/spot/i.test(lower)) return false;

  const pipeParts = lower.split("|").map((p) => p.trim().replace(/[^a-z0-9]/g, ""));
  if (pipeParts.some((p) => p === "trades")) return true;

  if (/\btrades\s*$/i.test(lower.replace(/[^a-z0-9|｜\s]/gi, " "))) return true;

  const words = lower
    .replace(/[^a-z0-9\s|]/g, " ")
    .split(/[\s|]+/)
    .filter(Boolean);

  if (words.length === 1 && words[0] === "trades") return true;

  return words.includes("trades") && !words.some((w) => w.includes("stock"));
}

export function isAlertsChannelName(name: string): boolean {
  const normalized = normalizeChannelLabel(name);
  const compact = normalized.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact.includes("activealerts") || compact.includes("activealert")) return true;
  if (compact.includes("active") && compact.includes("alert")) return true;
  if (/active[-\s]*alerts?/i.test(normalized)) return true;
  return false;
}

export function alertsChannelScore(name: string): number {
  const normalized = normalizeChannelLabel(name);
  if (!isAlertsChannelName(normalized)) return -1;
  if (/active-alerts/i.test(normalized)) return 100;
  return 50;
}

export function tradesChannelScore(name: string): number {
  const normalized = normalizeChannelLabel(name);
  if (!isTradesChannelName(normalized)) return -1;

  const pipeParts = normalized.toLowerCase().split("|").map((p) => p.trim());
  if (pipeParts.some((p) => p.replace(/[^a-z0-9]/g, "") === "trades")) return 100;
  if (normalized.toLowerCase() === "trades") return 90;
  if (/[|｜]\s*trades\s*$/i.test(normalized)) return 80;
  return 50;
}

export function channelIdFromUrl(url: string): string | null {
  const m = url.match(/discord\.com\/channels\/\d+\/(\d+)/);
  return m?.[1] ?? null;
}

export function channelIdFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = href.match(/channels\/\d+\/(\d+)/);
  return m?.[1] ?? null;
}

export async function waitForChannelName(
  getName: () => string,
  timeoutMs = 8_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const name = getName();
    if (name) return name;
    await new Promise((r) => setTimeout(r, 300));
  }
  return "";
}

async function clickBestTradesChannel(
  page: Page,
  guildId: string,
  getChannelName: () => string,
): Promise<{ channelId: string; channelName: string } | null> {
  const links = page.locator(`a[href*="/channels/${guildId}/"]`);
  const linkCount = await links.count();

  let bestLabel = "";
  let bestScore = -1;
  let bestIndex = -1;
  let bestHref: string | null = null;

  for (let i = 0; i < linkCount; i++) {
    const link = links.nth(i);
    const label = normalizeChannelLabel(await link.innerText());
    const score = tradesChannelScore(label);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
      bestIndex = i;
      bestHref = await link.getAttribute("href");
    }
  }

  if (bestIndex < 0 || bestScore < 0) return null;

  const hrefChannelId = channelIdFromHref(bestHref);

  console.log(`  → Kattintás: "${bestLabel.replace(/\n/g, " ")}"`);
  await links.nth(bestIndex).click({ timeout: 10_000 });
  await page.waitForTimeout(3_000);

  const urlId = channelIdFromUrl(page.url()) || hrefChannelId;
  const apiName = await waitForChannelName(getChannelName, 5_000);
  const name = apiName || bestLabel.split("\n").pop()?.trim() || bestLabel;

  if (!urlId) return null;

  if (tradesChannelScore(bestLabel) >= 50 || isTradesChannelName(name)) {
    return { channelId: urlId, channelName: name };
  }

  return null;
}

export async function navigateToTradesChannel(
  page: Page,
  getChannelName: () => string,
  waitForChannelId?: (channelId: string) => Promise<string>,
): Promise<{ channelId: string; channelName: string } | null> {
  const guildId = config.guildId;
  if (!guildId) return null;

  if (config.tradesChannelId) {
    console.log(`Navigálás: ${channelUrl(config.tradesChannelId)}`);
    await page.goto(channelUrl(config.tradesChannelId), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(3_000);

    const urlId = channelIdFromUrl(page.url());
    const name =
      (waitForChannelId ? await waitForChannelId(config.tradesChannelId) : "") ||
      (await waitForChannelName(getChannelName)) ||
      getChannelName();

    if (urlId === config.tradesChannelId) {
      if (name && !isTradesChannelName(name)) {
        console.warn(`\n⚠️  Csatornanév nem egyezik #trades mintával: #${name}`);
        console.warn(`    .env ID megbízható — folytatás: ${urlId}\n`);
      } else if (!name) {
        console.warn(`\n⚠️  Csatornanév nem érkezett REST-ből — .env ID: ${urlId}\n`);
      }
      return {
        channelId: urlId,
        channelName: name || `#trades (${urlId})`,
      };
    }

    if (name && !isTradesChannelName(name)) {
      console.warn(`\n⚠️  A .env csatorna NEM #trades: #${name}`);
      console.warn(`    (keresem a helyes #trades-t a sidebar-ban)\n`);
    }
  }

  console.log('Keresem a "🚀 | trades" csatornát (NEM stock-trade / stocks)…');
  await page.goto(`https://discord.com/channels/${guildId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(4_000);

  const found = await clickBestTradesChannel(page, guildId, getChannelName);
  if (found) {
    console.log(`\n✓ #trades: ${found.channelName} → ${found.channelId}`);
    return found;
  }

  const urlFallback = channelIdFromUrl(page.url());
  if (urlFallback && getChannelName() && isTradesChannelName(getChannelName())) {
    return { channelId: urlFallback, channelName: getChannelName() };
  }

  console.error("\nNem találom a #trades (🚀 | trades) csatornát.");
  console.error("Futtasd: npm run discord:pick -- trades\n");
  return null;
}

async function waitForAlertsChannelFromGuildApi(
  page: Page,
  guildId: string,
  timeoutMs = 15_000,
): Promise<{ channelId: string; channelName: string } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: { channelId: string; channelName: string } | null) => {
      if (settled) return;
      settled = true;
      page.off("response", handler);
      resolve(result);
    };

    const handler = async (response: { url: () => string; status: () => number; json: () => Promise<unknown> }) => {
      const url = response.url();
      if (!url.includes(`/guilds/${guildId}/channels`) || response.status() !== 200) return;
      try {
        const match = findAlertsChannel(parseGuildChannels(await response.json()));
        if (match) done({ channelId: match.id, channelName: match.name });
      } catch {
        // ignore
      }
    };

    page.on("response", (r) => void handler(r));
    setTimeout(() => done(null), timeoutMs);
  });
}

async function clickBestAlertsChannel(
  page: Page,
  guildId: string,
  getChannelName: () => string,
): Promise<{ channelId: string; channelName: string } | null> {
  const links = page.locator(`a[href*="/channels/${guildId}/"]`);
  const linkCount = await links.count();

  let bestLabel = "";
  let bestScore = -1;
  let bestIndex = -1;
  let bestHref: string | null = null;

  for (let i = 0; i < linkCount; i++) {
    const link = links.nth(i);
    const label = normalizeChannelLabel(await link.innerText());
    const score = alertsChannelScore(label);
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
      bestIndex = i;
      bestHref = await link.getAttribute("href");
    }
  }

  if (bestIndex < 0 || bestScore < 0) return null;

  const hrefChannelId = channelIdFromHref(bestHref);
  console.log(`  → Kattintás: "${bestLabel.replace(/\n/g, " ")}"`);
  await links.nth(bestIndex).click({ timeout: 10_000 });
  await page.waitForTimeout(3_000);

  const urlId = channelIdFromUrl(page.url()) || hrefChannelId;
  const apiName = await waitForChannelName(getChannelName, 5_000);
  const name = apiName || bestLabel.split("\n").pop()?.trim() || bestLabel;

  if (!urlId) return null;
  if (alertsChannelScore(bestLabel) >= 50 || isAlertsChannelName(name)) {
    return { channelId: urlId, channelName: name };
  }
  return null;
}

export async function navigateToAlertsChannel(
  page: Page,
  getChannelName: () => string,
  waitForChannelId?: (channelId: string) => Promise<string>,
): Promise<{ channelId: string; channelName: string } | null> {
  const guildId = config.guildId;
  if (!guildId) return null;

  if (config.alertsChannelId) {
    console.log(`Navigálás: ${channelUrl(config.alertsChannelId)}`);
    await page.goto(channelUrl(config.alertsChannelId), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(3_000);

    const urlId = channelIdFromUrl(page.url());
    const name =
      (waitForChannelId ? await waitForChannelId(config.alertsChannelId) : "") ||
      (await waitForChannelName(getChannelName)) ||
      getChannelName();

    if (urlId === config.alertsChannelId) {
      return { channelId: urlId, channelName: name || `#active-alerts (${urlId})` };
    }
  }

  console.log("Keresem a #active-alerts csatornát…");
  await page.goto(`https://discord.com/channels/${guildId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  const fromApi = await waitForAlertsChannelFromGuildApi(page, guildId);
  if (fromApi) {
    await page.goto(channelUrl(fromApi.channelId), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2_000);
    console.log(`\n✓ #active-alerts (API): ${fromApi.channelName} → ${fromApi.channelId}`);
    return fromApi;
  }

  await page.waitForTimeout(4_000);

  const found = await clickBestAlertsChannel(page, guildId, getChannelName);
  if (found) {
    console.log(`\n✓ #active-alerts: ${found.channelName} → ${found.channelId}`);
    return found;
  }

  console.error("\nNem találom a #active-alerts csatornát.");
  console.error("Futtasd: npm run discord:pick -- alerts\n");
  return null;
}
