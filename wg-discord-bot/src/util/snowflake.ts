/** Discord snowflake → Unix ms (approximate message time). */
export function messageTimestampMs(id: string): number {
  try {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
  } catch {
    return Date.now();
  }
}

export function messageAgeMs(id: string): number {
  return Date.now() - messageTimestampMs(id);
}

export function isMessageOlderThan(id: string, maxAgeMs: number): boolean {
  return messageAgeMs(id) > maxAgeMs;
}

/** Snowflake for a timestamp (testing / diagnostics). */
export function snowflakeFromTimestampMs(ts: number): string {
  return String((BigInt(Math.floor(ts - 1420070400000)) << 22n) + 1n);
}
