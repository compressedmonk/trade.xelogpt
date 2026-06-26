import {
  flattenComponents,
  hasUnlockButton,
  isUnlockTeaser,
  normalizeGatewayMessage,
  applyUnlocked,
} from "../src/discord/normalize.js";
import { isTradesChannelName } from "../src/discord/navigate.js";
import { parseGatewayEvent } from "../src/discord/gateway-parser.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Unlock teaser detection
const teaserComponents = [
  {
    type: 1,
    components: [{ type: 2, style: 1, label: "Unlock Content", custom_id: "unlock_abc" }],
  },
];

assert(hasUnlockButton(teaserComponents), "has unlock button");
assert(
  isUnlockTeaser({ content: "@user Press the button to unlock the content...", components: [] }),
  "content teaser",
);
assert(!isUnlockTeaser({ content: "@Johnny btc limit long 61583", components: [] }), "not teaser");

// Gateway MESSAGE_UPDATE
const updateFrame = JSON.stringify({
  t: "MESSAGE_UPDATE",
  d: {
    id: "222",
    channel_id: "trades-ch",
    content: "updated",
    author: { username: "WG Bot" },
    components: teaserComponents,
  },
});

const updateEvent = parseGatewayEvent(updateFrame);
assert(updateEvent?.type === "MESSAGE_UPDATE", "MESSAGE_UPDATE parse");
const normalized = normalizeGatewayMessage(updateEvent!.message);
assert(normalized?.requiresUnlock === true, "update teaser flagged");

// applyUnlocked
const teaser = normalizeGatewayMessage({
  id: "333",
  channel_id: "trades-ch",
  content: "Press the button to unlock",
  author: { username: "WG Bot" },
  components: teaserComponents,
})!;

const unlocked = applyUnlocked(teaser, {
  content: "Xpl limit 0.0782 0.075 stop 0.067",
  source: "interaction",
});
assert(unlocked.requiresUnlock === false, "no longer requires unlock");
assert(unlocked.content.includes("Xpl limit"), "unlocked content applied");

assert(isTradesChannelName("🚀 | trades"), "WG trades channel");
assert(isTradesChannelName("🚀｜trades"), "fullwidth pipe");
assert(isTradesChannelName("Szöveg (korlátozott) 🚀｜trades"), "HU sidebar label");
assert(!isTradesChannelName("stock-trade"), "reject stock-trade");
assert(!isTradesChannelName("stocks"), "reject stocks");
assert(!isTradesChannelName("active-alerts"), "reject alerts");

console.log("All unlock tests passed.");
