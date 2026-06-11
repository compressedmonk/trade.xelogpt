const X_API = "https://api.x.com/2";

function bearerToken(): string {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) throw new Error("TWITTER_BEARER_TOKEN not configured");
  return token;
}

async function xGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${X_API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${bearerToken()}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export interface XUser {
  id: string;
  name: string;
  username: string;
}

export interface XTweet {
  id: string;
  text: string;
  created_at?: string;
}

export async function lookupUserByUsername(username: string): Promise<XUser | null> {
  const data = await xGet<{ data?: XUser }>(`/users/by/username/${encodeURIComponent(username)}`, {
    "user.fields": "name,username",
  });
  return data.data ?? null;
}

export async function fetchUserTweets(
  userId: string,
  opts: { sinceId?: string; maxResults?: number } = {},
): Promise<XTweet[]> {
  const params: Record<string, string> = {
    "tweet.fields": "created_at,text",
    max_results: String(Math.min(opts.maxResults ?? 10, 10)),
  };
  if (opts.sinceId) params.since_id = opts.sinceId;

  const data = await xGet<{ data?: XTweet[] }>(`/users/${userId}/tweets`, params);
  return data.data ?? [];
}
