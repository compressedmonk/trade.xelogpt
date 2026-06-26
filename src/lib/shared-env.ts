import fs from "fs";
import path from "path";

let degenEnvCache: Record<string, string> | null = null;

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function degenEnvPaths(): string[] {
  return [
    process.env.DEGEN_ENV_PATH,
    "/opt/degen-bot/.env",
    path.join(process.cwd(), "degen-bot/.env"),
  ].filter((p): p is string => Boolean(p));
}

function loadDegenEnv(): Record<string, string> {
  if (degenEnvCache) return degenEnvCache;
  for (const envPath of degenEnvPaths()) {
    try {
      if (fs.existsSync(envPath)) {
        degenEnvCache = parseEnvFile(fs.readFileSync(envPath, "utf8"));
        return degenEnvCache;
      }
    } catch {
      // try next path
    }
  }
  degenEnvCache = {};
  return degenEnvCache;
}

/** Resolve env var from process.env, falling back to degen-bot/.env on disk. */
export function resolveEnv(key: string): string {
  const direct = process.env[key]?.trim();
  if (direct) return direct;
  return loadDegenEnv()[key]?.trim() ?? "";
}
