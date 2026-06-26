import { resolveEnv } from "./shared-env";

export interface DegenWatchProfile {
  userId: string;
  tag: "primary" | "extra";
  buyMode: "full" | "fraction";
  buyFraction?: number;
  /** Display name if known */
  label: string;
  buyLabel: string;
}

const KNOWN_USERS: Record<string, string> = {
  "242333226964746240": "CryptoGodJohn",
  "779205885683171340": "fattony1354",
  "189920943101968386": "ca.lam.i.ty",
  "863385070261239828": "TheCryptoNative",
};

function parseIdSet(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseExtraWatch(raw: string, primaryUserId: string): DegenWatchProfile[] {
  if (!raw.trim()) return [];

  const profiles: DegenWatchProfile[] = [];
  for (const entry of raw.split("|")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;

    const userId = trimmed.slice(0, colon).trim();
    const buyFraction = Number(trimmed.slice(colon + 1).trim());
    if (!userId || userId === primaryUserId) continue;
    if (!Number.isFinite(buyFraction) || buyFraction <= 0 || buyFraction > 1) continue;

    profiles.push({
      userId,
      tag: "extra",
      buyMode: "fraction",
      buyFraction,
      label: KNOWN_USERS[userId] ?? userId,
      buyLabel: `${(buyFraction * 100).toFixed(0)}% spendable`,
    });
  }
  return profiles;
}

export function loadDegenWatchProfiles(): DegenWatchProfile[] {
  const watchRaw = resolveEnv("DEGEN_WATCH_USER_ID");
  const extraRaw = resolveEnv("DEGEN_EXTRA_WATCH");
  const ids = parseIdSet(watchRaw);
  if (ids.length === 0) return [];

  const primaryUserId = ids[0]!;
  const primary: DegenWatchProfile = {
    userId: primaryUserId,
    tag: "primary",
    buyMode: "full",
    label: KNOWN_USERS[primaryUserId] ?? primaryUserId,
    buyLabel: "full spendable",
  };

  return [primary, ...parseExtraWatch(extraRaw, primaryUserId)];
}

export function profileForUser(userId: string): DegenWatchProfile | undefined {
  return loadDegenWatchProfiles().find((p) => p.userId === userId);
}

export function primaryBotWallet(): string {
  return resolveEnv("DEGEN_BOT_WALLET");
}

export function extraBotWallet(): string {
  return resolveEnv("DEGEN_EXTRA_BOT_WALLET");
}

export function destWallet(): string {
  return resolveEnv("DEGEN_DEST_WALLET");
}
