import { createQueuePump } from "../src/discord/queue-pump.js";
import {
  classifyUnlockError,
  createInteractionPendingMap,
  looksLikeUnlockedSignal,
  resolveInteractionPending,
} from "../src/discord/unlock.js";
import { applyUnlocked, normalizeGatewayMessage } from "../src/discord/normalize.js";
import { messageText } from "../src/discord/message-text.js";
import type { UnlockedContent } from "../src/types.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Queue pump: urgent is always drained before trades ---
{
  const order: string[] = [];
  let work = 2;
  const pump = createQueuePump({
    isReady: () => true,
    hasWork: () => work > 0,
    drainUrgent: async () => {
      order.push("u");
      work--;
    },
    drainTrade: async () => {
      order.push("t");
      work--;
    },
  });
  await pump.pump();
  assert(order.join(",") === "u,t", "urgent drained before trade");
}

// --- Queue pump: no concurrent runs even with overlapping calls ---
{
  let active = 0;
  let maxConcurrent = 0;
  let work = 2;
  const slow = async () => {
    active++;
    maxConcurrent = Math.max(maxConcurrent, active);
    await delay(15);
    active--;
    work--;
  };
  const pump = createQueuePump({
    isReady: () => true,
    hasWork: () => work > 0,
    drainUrgent: slow,
    drainTrade: slow,
  });
  await Promise.all([pump.pump(), pump.pump(), pump.pump()]);
  assert(maxConcurrent === 1, "pump never runs drains concurrently");
}

// --- Queue pump: a throwing drain does not wedge the pump (P0-2) ---
{
  let calls = 0;
  const pump = createQueuePump({
    isReady: () => true,
    hasWork: () => false,
    drainUrgent: async () => {
      calls++;
      throw new Error("boom");
    },
    drainTrade: async () => {},
  });
  let threw = false;
  try {
    await pump.pump();
  } catch {
    threw = true;
  }
  assert(threw, "drain error propagates");
  assert(pump.isPumping() === false, "pumping flag reset after throw");
  await pump.pump().catch(() => {});
  assert(calls === 2, "pump still works after a previous throw");
}

// --- Queue pump: not ready -> no work ---
{
  let ran = false;
  const pump = createQueuePump({
    isReady: () => false,
    hasWork: () => true,
    drainUrgent: async () => {
      ran = true;
    },
    drainTrade: async () => {},
  });
  await pump.pump();
  assert(!ran, "pump does nothing until ready");
}

// --- Unlock content validation ---
assert(looksLikeUnlockedSignal("▲ LIMIT BTC | Entry: 1 | SL: 2 | Risk: 1%"), "limit embed is signal");
assert(looksLikeUnlockedSignal("Xpl limit 0.0782 0.075 stop 0.067"), "content limit is signal");
assert(!looksLikeUnlockedSignal("Only you can see this"), "ephemeral noise is not a signal");
assert(!looksLikeUnlockedSignal("GM everyone, gl today"), "chatter is not a signal");

// --- Unlock error classification ---
assert(classifyUnlockError("unlock button not found in DOM") === "transient", "not found is transient");
assert(classifyUnlockError("Element is not attached to the DOM") === "transient", "detached is transient");
assert(classifyUnlockError("locator.click: Timeout 5000ms exceeded") === "transient", "timeout is transient");
assert(classifyUnlockError("no content after unlock click") === "hard", "no content is hard");

// --- resolveInteractionPending: exact id resolves only that entry ---
type Pending = {
  resolve: (v: UnlockedContent) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const content: UnlockedContent = { content: "x", source: "interaction" };

{
  const map = createInteractionPendingMap() as unknown as Map<string, Pending>;
  let resolvedA: UnlockedContent | null = null;
  let resolvedB: UnlockedContent | null = null;
  const tA = setTimeout(() => {}, 100_000);
  const tB = setTimeout(() => {}, 100_000);
  map.set("A", { resolve: (v) => (resolvedA = v), reject: () => {}, timer: tA });
  map.set("B", { resolve: (v) => (resolvedB = v), reject: () => {}, timer: tB });
  resolveInteractionPending(map as never, "B", content);
  clearTimeout(tA);
  clearTimeout(tB);
  assert(resolvedB !== null && resolvedA === null, "only matching id resolves");
}

// --- resolveInteractionPending: null id resolves only when single pending ---
{
  const map = createInteractionPendingMap() as unknown as Map<string, Pending>;
  let resolved: UnlockedContent | null = null;
  const t = setTimeout(() => {}, 100_000);
  map.set("only", { resolve: (v) => (resolved = v), reject: () => {}, timer: t });
  resolveInteractionPending(map as never, null, content);
  clearTimeout(t);
  assert(resolved !== null, "single pending resolved on null id");
}

{
  const map = createInteractionPendingMap() as unknown as Map<string, Pending>;
  let count = 0;
  const t1 = setTimeout(() => {}, 100_000);
  const t2 = setTimeout(() => {}, 100_000);
  map.set("a", { resolve: () => count++, reject: () => {}, timer: t1 });
  map.set("b", { resolve: () => count++, reject: () => {}, timer: t2 });
  resolveInteractionPending(map as never, null, content);
  clearTimeout(t1);
  clearTimeout(t2);
  assert(count === 0, "ambiguous null id resolves nothing");
}

// --- messageText does not duplicate unlocked content (P1) ---
{
  const teaser = normalizeGatewayMessage({
    id: "1",
    channel_id: "trades",
    content: "Press the button to unlock the content",
    author: { username: "WG Bot" },
    components: [{ type: 2, label: "Unlock Content" }],
  })!;
  const unlocked = applyUnlocked(teaser, {
    content: "LIMIT XPL | Entry: 1 − 2 | SL: 3 | Risk: 1%",
    embedDescription: "Status: Valid limit order",
    source: "interaction",
  });
  const text = messageText(unlocked);
  assert((text.match(/LIMIT XPL/g) ?? []).length === 1, "limit line appears exactly once");
  assert(text.includes("Valid limit order"), "status preserved");
}

console.log("All watcher-logic tests passed.");
