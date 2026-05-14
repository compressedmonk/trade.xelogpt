import { NextRequest, NextResponse } from "next/server";
import { sendMessage, formatTokenAlert } from "@/lib/telegram";
import { getTokenInfo, getTokenSecurity, getTrending } from "@/lib/gmgn-client";
import { formatPrice, formatMarketCap } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body?.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);
    const text = message.text.trim();

    if (text === "/start" || text === "/help") {
      await sendMessage(
        [
          "<b>SolTrade Bot</b>",
          "",
          "/trending - Top 5 trending tokens",
          "/check &lt;address&gt; - Token info + security",
          "/price &lt;address&gt; - Quick price check",
          "/id - Your chat ID (for config)",
        ].join("\n"),
        chatId,
      );
      return NextResponse.json({ ok: true });
    }

    if (text === "/id") {
      await sendMessage(`Your chat ID: <code>${chatId}</code>`, chatId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/trending") {
      try {
        const data: any = await getTrending("sol", "1h", { limit: 5 });
        const tokens = data?.rank ?? [];
        if (!tokens.length) {
          await sendMessage("No trending data available", chatId);
          return NextResponse.json({ ok: true });
        }

        const lines = ["<b>Trending Solana (1h)</b>", ""];
        for (let i = 0; i < Math.min(5, tokens.length); i++) {
          const t = tokens[i];
          lines.push(
            `${i + 1}. <b>${t.symbol}</b> | ${formatPrice(t.price)} | MCap: ${formatMarketCap(t.market_cap ?? t.usd_market_cap)}`,
          );
        }
        await sendMessage(lines.join("\n"), chatId);
      } catch {
        await sendMessage("Failed to fetch trending data", chatId);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/check ")) {
      const address = text.slice(7).trim();
      if (!address || address.length < 30) {
        await sendMessage("Usage: /check &lt;token_address&gt;", chatId);
        return NextResponse.json({ ok: true });
      }

      try {
        const [info, security] = await Promise.all([
          getTokenInfo("sol", address).catch(() => null),
          getTokenSecurity("sol", address).catch(() => null),
        ]);

        if (!info) {
          await sendMessage("Token not found", chatId);
          return NextResponse.json({ ok: true });
        }

        const priceNum = typeof info.price === "object" ? parseFloat(info.price?.price ?? "0") : Number(info.price ?? 0);
        const supply = parseFloat(info.circulating_supply ?? info.total_supply ?? "0");

        const lines = [
          `<b>${info.symbol}</b> - ${info.name}`,
          `Price: ${formatPrice(priceNum)}`,
          `MCap: ${formatMarketCap(priceNum * supply)}`,
          `Holders: ${info.holder_count ?? "?"}`,
          `Liquidity: ${formatMarketCap(parseFloat(info.liquidity ?? "0"))}`,
          `Platform: ${info.launchpad_platform ?? "?"}`,
        ];

        if (security) {
          lines.push("");
          lines.push("<b>Security:</b>");
          lines.push(`Mint renounced: ${security.renounced_mint ? "Yes" : "No"}`);
          lines.push(`Freeze renounced: ${security.renounced_freeze_account ? "Yes" : "No"}`);
          lines.push(`Top 10 hold: ${(parseFloat(security.top_10_holder_rate ?? "0") * 100).toFixed(0)}%`);
          lines.push(`Dev status: ${security.creator_token_status ?? "?"}`);
        }

        lines.push("");
        lines.push(`<a href="https://trade.xelogpt.com/token/${address}">Full Details</a>`);

        await sendMessage(lines.join("\n"), chatId);
      } catch {
        await sendMessage("Error fetching token data", chatId);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/price ")) {
      const address = text.slice(7).trim();
      if (!address || address.length < 30) {
        await sendMessage("Usage: /price &lt;token_address&gt;", chatId);
        return NextResponse.json({ ok: true });
      }

      try {
        const info: any = await getTokenInfo("sol", address);
        if (!info) {
          await sendMessage("Token not found", chatId);
          return NextResponse.json({ ok: true });
        }

        const priceNum = typeof info.price === "object" ? parseFloat(info.price?.price ?? "0") : Number(info.price ?? 0);
        await sendMessage(`<b>${info.symbol}</b>: ${formatPrice(priceNum)}`, chatId);
      } catch {
        await sendMessage("Error", chatId);
      }
      return NextResponse.json({ ok: true });
    }

    await sendMessage("Unknown command. Use /help", chatId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
