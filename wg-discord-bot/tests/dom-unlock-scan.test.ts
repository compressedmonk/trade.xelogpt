import { messageIdFromListItemId } from "../src/discord/unlock.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const listId =
  "chat-messages-742797926761234463-1026871730964271134-1514984736345559154";
assert(
  messageIdFromListItemId(listId) === "1514984736345559154",
  "extract message id",
);
assert(messageIdFromListItemId("invalid") === null, "invalid id");

console.log("All dom-unlock-scan tests passed.");
