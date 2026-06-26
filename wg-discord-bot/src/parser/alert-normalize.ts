/** WG #active-alerts markdown: <:Long:123> [**BTC**](url): Stops moved to BE */

export function normalizeWgAlertText(raw: string): string {
  let line = raw.trim().split("\n")[0].trim();
  line = line.replace(/<a?:\w+:\d+>/g, "").replace(/<:\w+:\d+>/g, "");
  line = line.replace(/\[\*\*([A-Za-z0-9]+)\*\*\]\([^)]*\)/g, "$1");
  line = line.replace(/^[\s🏦💰🔼🔻🏛️]+/, "");
  line = line.replace(/\s+/g, " ").trim();
  return line;
}

export function looksLikeWgAlert(raw: string): boolean {
  const line = raw.trim().split("\n")[0];
  if (/\)\s*:\s*\S/.test(line)) return true;
  const norm = normalizeWgAlertText(line);
  if (/^[A-Z][A-Z0-9]*:\s/i.test(norm)) return true;
  return /^(?:🔼|🔻|💰|🏦|🏛️)\s*[A-Z]/i.test(line);
}

export function extractAssetAndBodyFromWgAlert(
  raw: string,
): { asset: string; body: string } | null {
  const norm = normalizeWgAlertText(raw);
  const m = norm.match(/^([A-Z][A-Z0-9]*)\s*:\s*(.+)$/i);
  if (!m) return null;
  return { asset: m[1].toUpperCase(), body: m[2] };
}
