const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  followerCount: number;
  displayName: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedMetrics(username: string): CacheEntry | null {
  const key = username.toLowerCase();
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedMetrics(username: string, followerCount: number, displayName: string): void {
  cache.set(username.toLowerCase(), {
    followerCount,
    displayName,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getMissingUsernames(usernames: string[]): string[] {
  return usernames.filter((u) => !getCachedMetrics(u));
}
