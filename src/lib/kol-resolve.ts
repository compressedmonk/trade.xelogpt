import { getKols } from "@/lib/gmgn-client";
import { normalizeTwitterUsername } from "@/lib/mention-parser";

interface KolTrade {
  maker?: string;
  maker_info?: { twitter_username?: string };
}

export async function resolveWalletFromGmgn(twitterUsername: string): Promise<string | null> {
  const normalized = normalizeTwitterUsername(twitterUsername);
  const data = await getKols("sol", 100).catch(() => ({ list: [] }));
  const list: KolTrade[] = Array.isArray(data) ? data : ((data as { list?: KolTrade[] }).list ?? []);

  for (const trade of list) {
    const handle = trade.maker_info?.twitter_username;
    if (!handle || !trade.maker) continue;
    if (normalizeTwitterUsername(handle) === normalized) {
      return trade.maker;
    }
  }

  return null;
}
