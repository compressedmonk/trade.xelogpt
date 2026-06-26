import type { BrowserContext } from "playwright";

export interface ChannelRegistry {
  getName(channelId: string): string;
  waitForName(channelId: string, timeoutMs?: number): Promise<string>;
}

export function attachChannelRegistry(context: BrowserContext): ChannelRegistry {
  const names = new Map<string, string>();

  const onResponse = async (response: { url: () => string; status: () => number; json: () => Promise<unknown> }) => {
    const url = response.url();
    const m = url.match(/\/api\/v\d+\/channels\/(\d+)$/);
    if (!m || response.status() !== 200) return;
    try {
      const body = (await response.json()) as { name?: string };
      if (body.name) names.set(m[1], body.name);
    } catch {
      // ignore
    }
  };

  context.on("page", (page) => {
    page.on("response", (response) => void onResponse(response));
  });

  for (const page of context.pages()) {
    page.on("response", (response) => void onResponse(response));
  }

  return {
    getName(channelId: string): string {
      return names.get(channelId) ?? "";
    },
    async waitForName(channelId: string, timeoutMs = 10_000): Promise<string> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const name = names.get(channelId);
        if (name) return name;
        await new Promise((r) => setTimeout(r, 300));
      }
      return names.get(channelId) ?? "";
    },
  };
}
