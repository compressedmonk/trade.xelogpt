export interface ParsedMention {
  tokenSymbols: string[];
  tokenAddresses: string[];
}

const TICKER_RE = /\$([A-Za-z][A-Za-z0-9]{1,14})\b/g;
const SOL_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const PUMP_FUN_RE = /pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/gi;
const DEXSCREENER_RE = /dexscreener\.com\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/gi;

export function normalizeTwitterUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

function collectMatches(text: string, re: RegExp, onMatch: (m: RegExpExecArray) => void) {
  const regex = new RegExp(re.source, re.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) onMatch(match);
}

export function parseMentionsFromText(text: string): ParsedMention {
  const symbols = new Set<string>();
  const addresses = new Set<string>();

  collectMatches(text, TICKER_RE, (m) => symbols.add(m[1].toUpperCase()));
  collectMatches(text, SOL_ADDRESS_RE, (m) => {
    if (m[0].length >= 32) addresses.add(m[0]);
  });
  collectMatches(text, PUMP_FUN_RE, (m) => addresses.add(m[1]));
  collectMatches(text, DEXSCREENER_RE, (m) => addresses.add(m[1]));

  return {
    tokenSymbols: Array.from(symbols),
    tokenAddresses: Array.from(addresses),
  };
}

export function hasTokenMention(parsed: ParsedMention): boolean {
  return parsed.tokenSymbols.length > 0 || parsed.tokenAddresses.length > 0;
}
