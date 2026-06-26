import {
  isDirectLimitSignal,
  isUnlockTeaser,
  isWgBotMessage,
} from "../src/discord/normalize.js";
import { parseLimitSignal } from "../src/parser/limit-signal.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const teaser = {
  content: "Press the button to unlock the content",
  components: [{ type: 2, label: "Unlock Content" }],
};
assert(isUnlockTeaser(teaser), "teaser");
assert(!isDirectLimitSignal(teaser), "teaser not direct");

const direct = {
  content: "@Johnny btc limit long 61583 - 61142 sl 59842",
  embedDescription: "▲ LIMIT BTC | Entry: 61583 - 61142 | SL: 59842 | Risk: 1%\nStatus: Valid limit order",
  components: [],
};
assert(isDirectLimitSignal(direct), "direct limit");
assert(!isUnlockTeaser(direct), "direct not teaser");

const signal = parseLimitSignal(
  [direct.content, direct.embedDescription].join("\n"),
  "direct-1",
)!;
assert(signal.trader === "Johnny", "trader Johnny");
assert(signal.asset === "BTC", "btc");

assert(
  isWgBotMessage(
    { authorName: "WG Bot", authorId: "1023602697238237195" } as never,
    "WG Bot",
    "1023602697238237195",
  ),
  "wg by id",
);

console.log("All direct-signal tests passed.");
