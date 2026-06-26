import { parseGatewayFrame } from "../src/discord/gateway-parser.js";
import { normalizeGatewayMessage, extractTraderMention } from "../src/discord/normalize.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Trade signal (gateway)
const tradeFrame = JSON.stringify({
  t: "MESSAGE_CREATE",
  d: {
    id: "111",
    channel_id: "trades-ch",
    content: "@Johnny btc limit long 61583 - 61142 sl 59842",
    author: { id: "bot1", username: "WG Bot", bot: true },
    embeds: [
      {
        title: "▲ LIMIT BTC | Entry: 61583 - 61142 | SL: 59842 | Risk: 1%",
        description: "Status: Valid limit order",
      },
    ],
  },
});

const tradeMsg = parseGatewayFrame(tradeFrame);
assert(tradeMsg !== null, "trade frame parse");
const normalized = normalizeGatewayMessage(tradeMsg!);
assert(normalized?.authorName === "WG Bot", "author");
assert(normalized?.embedTitle?.includes("LIMIT BTC"), "embed title");
assert(extractTraderMention(normalized!.content) === "Johnny", "trader from trade");

// Alert signal
const alertContent = "🔼 VELVET: TP1 (50%) - 50% remaining @-Tareeq";
assert(extractTraderMention(alertContent) === "-Tareeq", "trader from alert");

console.log("All gateway-parser tests passed.");
