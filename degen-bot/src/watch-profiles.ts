import { config } from "./config.js";
import { getWalletAddressFromPrivateKey } from "./solana/wallet.js";

export interface WatchProfile {
  userId: string;
  tag: "primary" | "extra";
  walletPrivateKey: string;
  buyMode: "full" | "fraction";
  /** Fraction of spendable balance (0–1). Extra profiles only, e.g. 0.3 = 30%. */
  buyFraction?: number;
}

let cachedProfiles: WatchProfile[] | null = null;

/** @internal test helper */
export function resetWatchProfilesCache(): void {
  cachedProfiles = null;
}

export function parseExtraWatch(
  raw: string,
  extraWalletKey: string,
  primaryUserId: string,
): WatchProfile[] {
  if (!raw.trim()) return [];

  const profiles: WatchProfile[] = [];
  for (const entry of raw.split("|")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      throw new Error(
        `Invalid DEGEN_EXTRA_WATCH entry "${trimmed}" — expected userId:buyFraction`,
      );
    }

    const userId = trimmed.slice(0, colon).trim();
    const buyFraction = Number(trimmed.slice(colon + 1).trim());

    if (!userId) throw new Error(`DEGEN_EXTRA_WATCH entry missing userId: "${trimmed}"`);
    if (userId === primaryUserId) {
      throw new Error(`Extra user ${userId} cannot be the same as primary DEGEN_WATCH_USER_ID`);
    }
    if (!Number.isFinite(buyFraction) || buyFraction <= 0 || buyFraction > 1) {
      throw new Error(
        `DEGEN_EXTRA_WATCH buyFraction must be in (0, 1] for user ${userId}, got ${trimmed.slice(colon + 1)} (e.g. 0.3 = 30%)`,
      );
    }

    profiles.push({
      userId,
      tag: "extra",
      walletPrivateKey: extraWalletKey,
      buyMode: "fraction",
      buyFraction,
    });
  }

  return profiles;
}

export function buildWatchProfiles(
  watchUserIds: Set<string>,
  primaryWalletKey: string,
  extraWalletKey: string,
  extraWatchRaw: string,
): WatchProfile[] {
  const ids = [...watchUserIds];
  if (ids.length === 0) throw new Error("DEGEN_WATCH_USER_ID is required");
  if (ids.length > 1) {
    console.warn(
      `[config] DEGEN_WATCH_USER_ID has ${ids.length} IDs — only the first (${ids[0]}) is primary (full wallet). Add others to DEGEN_EXTRA_WATCH.`,
    );
  }

  const primaryUserId = ids[0]!;
  const primary: WatchProfile = {
    userId: primaryUserId,
    tag: "primary",
    walletPrivateKey: primaryWalletKey,
    buyMode: "full",
  };

  const extras = parseExtraWatch(extraWatchRaw, extraWalletKey, primaryUserId);
  const seen = new Set<string>([primary.userId]);

  for (const extra of extras) {
    if (seen.has(extra.userId)) {
      throw new Error(`Duplicate watch user id in profiles: ${extra.userId}`);
    }
    seen.add(extra.userId);
  }

  return [primary, ...extras];
}

export function loadWatchProfiles(): WatchProfile[] {
  if (cachedProfiles) return cachedProfiles;
  cachedProfiles = buildWatchProfiles(
    config.watchUserIds,
    config.walletPrivateKey,
    config.extraWalletPrivateKey,
    config.extraWatch,
  );
  return cachedProfiles;
}

export function allWatchUserIds(): Set<string> {
  return new Set(loadWatchProfiles().map((p) => p.userId));
}

export function getProfileForUser(userId: string): WatchProfile | null {
  return loadWatchProfiles().find((p) => p.userId === userId) ?? null;
}

export function formatProfileSummary(profile: WatchProfile): string {
  const wallet = profile.walletPrivateKey
    ? getWalletAddressFromPrivateKey(profile.walletPrivateKey)
    : "(no key)";
  const size =
    profile.buyMode === "full"
      ? "full spendable"
      : `${((profile.buyFraction ?? 0) * 100).toFixed(0)}% spendable`;
  return `${profile.tag} user=${profile.userId} wallet=${wallet} buy=${size}`;
}

/** Unique wallet keys across all profiles (primary + shared extra). */
export function distinctWalletKeys(): { key: string; label: string }[] {
  const profiles = loadWatchProfiles();
  const seen = new Set<string>();
  const out: { key: string; label: string }[] = [];

  for (const p of profiles) {
    const k = p.walletPrivateKey.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const label = p.tag === "primary" ? "primary" : "extra wallet";
    out.push({ key: k, label });
  }
  return out;
}

/** Validate profile keys exist in LIVE mode. */
export function assertProfileWallets(): void {
  if (config.dryRun) return;

  const profiles = loadWatchProfiles();
  const hasExtra = profiles.some((p) => p.tag === "extra");

  if (!config.walletPrivateKey) {
    throw new Error("LIVE mode requires DEGEN_WALLET_PRIVATE_KEY");
  }
  if (hasExtra && !config.extraWalletPrivateKey) {
    throw new Error("LIVE mode requires DEGEN_EXTRA_WALLET_PRIVATE_KEY when DEGEN_EXTRA_WATCH is set");
  }
}
