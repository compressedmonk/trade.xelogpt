export function log(tag: string, message: string, extra?: unknown): void {
  const ts = new Date().toISOString();
  if (extra !== undefined) {
    console.log(`[${ts}] [${tag}] ${message}`, extra);
  } else {
    console.log(`[${ts}] [${tag}] ${message}`);
  }
}

export function logError(tag: string, message: string, err?: unknown): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [${tag}] ${message}`, err ?? "");
}
