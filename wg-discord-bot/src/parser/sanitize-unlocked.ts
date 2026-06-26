import type { SanitizedUnlock } from "./types.js";

const NOISE_RE =
  /^(APP|WG Bot|WG Trades|Position Overview|Set My Balance|Override Risk|Csak te látod|Az üzenet elvetése|Use the buttons)/i;

export function sanitizeUnlockedContent(raw: string): SanitizedUnlock {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !NOISE_RE.test(l) && !/^\d{4}\./.test(l) && l !== "—" && l !== ",");

  let embedLine: string | undefined;
  let contentLine: string | undefined;
  let statusLine: string | undefined;
  let trader: string | undefined;

  for (const line of lines) {
    if (/^LIMIT\s+\w+\s*\|/i.test(line)) embedLine = line;
    if (/\blimit\b/i.test(line) && /\b(?:stop|sl)\b/i.test(line) && !embedLine) contentLine = line;
    if (/status:/i.test(line)) statusLine = line;
  }

  const traderLines = lines.filter(
    (l) => /\blimit\b/i.test(l) || /^LIMIT\s/i.test(l) || /status:/i.test(l),
  );
  for (const line of traderLines.length ? traderLines : lines) {
    const traderMatch = line.match(/@([A-Za-z0-9_-]+)/);
    if (traderMatch && !line.includes("Press the button")) {
      trader = traderMatch[1];
      break;
    }
  }

  return { lines, embedLine, contentLine, statusLine, trader };
}
