type Level = "info" | "warn" | "error" | "debug";

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function write(level: Level, tag: string, msg: string, extra?: unknown): void {
  const line = `${ts()} [${tag}] ${msg}`;
  if (level === "error") console.error(line, extra ?? "");
  else if (level === "warn") console.warn(line, extra ?? "");
  else console.log(line, extra !== undefined ? extra : "");
}

export const log = {
  trade: (msg: string, extra?: unknown) => write("info", "trade", msg, extra),
  alert: (msg: string, extra?: unknown) => write("info", "alert", msg, extra),
  place: (msg: string, extra?: unknown) => write("info", "place", msg, extra),
  warn: (tag: string, msg: string, extra?: unknown) => write("warn", tag, msg, extra),
  error: (tag: string, msg: string, extra?: unknown) => write("error", tag, msg, extra),
};
