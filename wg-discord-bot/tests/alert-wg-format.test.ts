import { parseAlert, looksLikeWgAlert } from "../src/parser/alert-signal.js";
import { config } from "../src/config.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

config.followedTraders = ["Johnny"];

const hypeFill =
  "💰 [**HYPE**](https://discord.com/channels/742797926761234463/1026871730964271134/1512489531318730823): Limit order filled";
assert(looksLikeWgAlert(hypeFill), "looks like alert");
const fill = parseAlert(hypeFill)!;
assert(fill.asset === "HYPE", "hype asset");
assert(fill.actions[0].type === "limit_filled", "limit filled");
assert(fill.trader === "Johnny", "default trader");

const moveSl =
  "💰 [**HYPE**](https://discord.com/channels/x/y/z): Stops moved to 1.88 @Johnny";
const move = parseAlert(moveSl)!;
assert(move.actions[0].type === "move_sl", "move sl");

const goog =
  "🏦 [**GOOG**](https://discord.com/channels/x/y/z): Stops moved to BE @-DB";
const g = parseAlert(goog)!;
assert(g.actions[0].type === "skip", "goog skip");

const tradeLinkOnly =
  "<:Long:123> [**SPCX**](https://discord.com/channels/742797926761234463/1026871730964271134/1514984736345559154)";
assert(!looksLikeWgAlert(tradeLinkOnly), "trade link only");

const classic = "🔻 BTC: Stopped BE • Realized R/R: 0.00 @Johnny";
const c = parseAlert(classic)!;
assert(c.actions[0].type === "immediate_close", "classic");

console.log("All alert-wg-format tests passed.");
