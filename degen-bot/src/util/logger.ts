type Level = "info" | "warn" | "error";

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function write(level: Level, tag: string, msg: string, extra?: unknown): void {
  const line = `${ts()} [${tag}] ${msg}`;
  if (level === "error") console.error(line, extra ?? "");
  else if (level === "warn") console.warn(line, extra ?? "");
  else console.log(line, extra !== undefined ? extra : "");
}

export const log = {
  gw: (msg: string, extra?: unknown) => write("info", "gw", msg, extra),
  buy: (msg: string, extra?: unknown) => write("info", "buy", msg, extra),
  info: (tag: string, msg: string, extra?: unknown) => write("info", tag, msg, extra),
  warn: (tag: string, msg: string, extra?: unknown) => write("warn", tag, msg, extra),
  error: (tag: string, msg: string, extra?: unknown) => write("error", tag, msg, extra),
};
