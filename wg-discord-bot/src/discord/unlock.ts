import type { Locator, Page } from "playwright";
import type { RawDiscordMessage, UnlockResult, UnlockedContent } from "../types.js";
import { config } from "../config.js";
import { isMessageOlderThan } from "../util/snowflake.js";
import { flattenComponents } from "./normalize.js";

const UNLOCK_LABEL_RE = /unlock/i;
const UNLOCK_CONTENT_RE = /press the button to unlock|unlock the content|unlock content/i;
const INTERACTION_TIMEOUT_MS = 8_000;

/** Discord list item id ends with the message snowflake. */
export function messageIdFromListItemId(listId: string): string | null {
  const m = listId.match(/-(\d{17,20})$/);
  return m ? m[1] : null;
}

const DOM_SCAN_TAIL = 25;

/** Find messages that still show an Unlock button in the visible channel DOM. */
export async function scanVisibleUnlockTeasers(
  page: Page,
  channelId: string,
): Promise<RawDiscordMessage[]> {
  try {
    const rows = await page.evaluate(
      ({ channelId, tail, unlockReSource }) => {
        const unlockRe = new RegExp(unlockReSource, "i");
        const nodes = document.querySelectorAll(
          `[data-list-item-id*="chat-messages-${channelId}"]`,
        );
        const out: Array<{ id: string; content: string }> = [];
        const start = Math.max(0, nodes.length - tail);
        for (let i = nodes.length - 1; i >= start; i--) {
          const el = nodes[i] as HTMLElement;
          const listId = el.getAttribute("data-list-item-id") ?? "";
          const idMatch = listId.match(/-(\d{17,20})$/);
          if (!idMatch) continue;
          const buttons = Array.from(el.querySelectorAll("button"));
          if (!buttons.some((b) => /unlock/i.test(b.textContent ?? ""))) continue;
          const text = el.innerText ?? "";
          if (!unlockRe.test(text)) continue;
          out.push({ id: idMatch[1], content: text });
        }
        return out;
      },
      {
        channelId,
        tail: DOM_SCAN_TAIL,
        unlockReSource: UNLOCK_CONTENT_RE.source,
      },
    );

    return rows.map((row) => ({
      id: row.id,
      channelId,
      content: row.content,
      authorName: "WG Bot",
      authorId: "",
      components: [{ type: 2, label: "Unlock Content" }],
      capturedAt: new Date().toISOString(),
      source: "dom" as const,
      requiresUnlock: true,
    }));
  } catch {
    return [];
  }
}

export async function waitForTradesChannelReady(
  page: Page,
  channelId: string,
): Promise<void> {
  await page
    .waitForSelector(`[data-list-item-id*="chat-messages-${channelId}"]`, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.waitForTimeout(1_000);
}

interface InteractionMessageData {
  content?: string;
  embeds?: Array<{ title?: string; description?: string }>;
}

interface InteractionResponseBody {
  type?: number;
  data?: InteractionMessageData;
}

function parseInteractionBody(body: unknown): UnlockedContent | null {
  if (!body || typeof body !== "object") return null;
  const resp = body as InteractionResponseBody;

  // type 4 = CHANNEL_MESSAGE_WITH_SOURCE (ephemeral reply)
  if (resp.type === 4 && resp.data) {
    const embed = resp.data.embeds?.[0];
    const content = resp.data.content?.trim();
    const embedTitle = embed?.title;
    const embedDescription = embed?.description;
    if (content || embedTitle || embedDescription) {
      return { content, embedTitle, embedDescription, source: "interaction" };
    }
  }

  // type 7 = UPDATE_MESSAGE
  if (resp.type === 7 && resp.data) {
    const embed = resp.data.embeds?.[0];
    const content = resp.data.content?.trim();
    const embedTitle = embed?.title;
    const embedDescription = embed?.description;
    if (content || embedTitle || embedDescription) {
      return { content, embedTitle, embedDescription, source: "interaction" };
    }
  }

  return null;
}

export function attachInteractionCapture(
  page: Page,
  onUnlocked: (messageId: string | null, content: UnlockedContent) => void,
): void {
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/v9/interactions")) return;
    if (response.request().method() !== "POST") return;
    if (response.status() < 200 || response.status() >= 300) return;

    try {
      const body = await response.json();
      const parsed = parseInteractionBody(body);
      if (!parsed) return;

      let messageId: string | null = null;
      try {
        const postData = response.request().postData();
        if (postData) {
          const req = JSON.parse(postData) as { message_id?: string };
          messageId = req.message_id ?? null;
        }
      } catch {
        // ignore
      }

      onUnlocked(messageId, parsed);
    } catch {
      // non-json or empty body
    }
  });
}

async function scrollMessageAboveFooter(page: Page, messageId: string): Promise<void> {
  const message = page.locator(`[data-list-item-id*="${messageId}"]`).first();
  if ((await message.count()) === 0) return;

  await message.evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "instant" });
  });
  await page.waitForTimeout(250);

  const scroller = page.locator('[class*="scroller"][class*="auto"]').first();
  if ((await scroller.count()) > 0) {
    await scroller.evaluate((el) => {
      el.scrollTop -= 140;
    });
    await page.waitForTimeout(200);
  }
}

async function dismissDiscordOverlay(page: Page): Promise<void> {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
}

async function safeClickButton(button: Locator): Promise<void> {
  if (config.discordKeepBackground) {
    await button.evaluate((el) => (el as HTMLElement).click());
    return;
  }
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (box) {
    await button.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return;
  }
  try {
    await button.click({ timeout: 8_000 });
  } catch {
    await button.dispatchEvent("click");
  }
}

async function clickUnlockInDom(page: Page, messageId: string): Promise<boolean> {
  await scrollMessageAboveFooter(page, messageId);

  const message = page.locator(`[data-list-item-id*="${messageId}"]`).first();
  if ((await message.count()) === 0) return false;

  // Only <button> with Unlock label — never attachments / image links in the post.
  const unlockBtn = message.locator("button").filter({ hasText: /^Unlock/i }).first();
  if ((await unlockBtn.count()) > 0) {
    await safeClickButton(unlockBtn);
    return true;
  }

  const unlockBtnRole = message.getByRole("button", { name: UNLOCK_LABEL_RE }).first();
  if ((await unlockBtnRole.count()) > 0) {
    await safeClickButton(unlockBtnRole);
    return true;
  }

  return false;
}

/** The unlocked content must contain a recognizable limit signal, otherwise we
 * have scraped the wrong element (e.g. an unrelated channel message). */
export function looksLikeUnlockedSignal(text: string): boolean {
  return /LIMIT\s+\w+/i.test(text) || /\blimit\b[\s\S]*\b(?:stop|sl)\b/i.test(text);
}

/**
 * Transient problems (button not found, detached node, navigation, timeout) are
 * retryable; a click that lands but yields no usable content is a hard failure.
 */
export function classifyUnlockError(error: string): "transient" | "hard" {
  return /not found|not attached|detached|timeout|navigation|no interaction/i.test(error)
    ? "transient"
    : "hard";
}

async function scrapeEphemeralFromDom(page: Page): Promise<UnlockedContent | null> {
  // Ephemeral unlock replies render with "Only you can see this". Scope to those
  // nodes only; never fall back to "last message in channel" (wrong content).
  const ephemerals = page.locator('[class*="ephemeral"], [aria-label*="Only you"]');
  const count = await ephemerals.count();

  for (let i = count - 1; i >= 0; i--) {
    const text = await ephemerals.nth(i).innerText({ timeout: 2_000 }).catch(() => "");
    if (!text) continue;

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/only you can see|unlock content|press the button/i.test(l));

    const content = lines.join("\n").trim();
    if (content && looksLikeUnlockedSignal(content)) {
      return { content, source: "dom" };
    }
  }

  return null;
}

type PendingInteraction = {
  resolve: (v: UnlockedContent) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function cancelInteractionWait(
  messageId: string,
  pending: Map<string, PendingInteraction>,
): void {
  const entry = pending.get(messageId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(messageId);
  entry.reject(new Error("cancelled"));
}

function waitForInteraction(
  messageId: string,
  pending: Map<string, PendingInteraction>,
): Promise<UnlockedContent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(messageId);
      reject(new Error("interaction timeout"));
    }, INTERACTION_TIMEOUT_MS);

    pending.set(messageId, {
      resolve: (v) => {
        clearTimeout(timer);
        pending.delete(messageId);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        pending.delete(messageId);
        reject(e);
      },
      timer,
    });
  });
}

export async function unlockTeaser(
  page: Page,
  msg: RawDiscordMessage,
  pendingInteractions: Map<string, PendingInteraction>,
): Promise<UnlockResult> {
  const buttons = flattenComponents(msg.components).filter((c) =>
    UNLOCK_LABEL_RE.test(c.label ?? ""),
  );

  if (!msg.requiresUnlock && buttons.length === 0) {
    return { messageId: msg.id, success: false, error: "not an unlock teaser" };
  }

  const interactionPromise = waitForInteraction(msg.id, pendingInteractions).catch(() => null);

  const clicked = await clickUnlockInDom(page, msg.id);
  if (!clicked) {
    cancelInteractionWait(msg.id, pendingInteractions);
    return { messageId: msg.id, success: false, error: "unlock button not found in DOM" };
  }

  try {
    const fromInteraction = await interactionPromise;
    if (!fromInteraction) {
      throw new Error("no interaction response");
    }
    const combined = [
      fromInteraction.content,
      fromInteraction.embedTitle,
      fromInteraction.embedDescription,
    ]
      .filter(Boolean)
      .join("\n");
    if (!looksLikeUnlockedSignal(combined)) {
      throw new Error("interaction content not a signal");
    }
    return {
      messageId: msg.id,
      success: true,
      source: fromInteraction.source,
      content: fromInteraction.content,
      embedTitle: fromInteraction.embedTitle,
      embedDescription: fromInteraction.embedDescription,
    };
  } catch {
    // DOM fallback — poll briefly for the ephemeral reply to render.
    let fromDom: UnlockedContent | null = null;
    for (let i = 0; i < 4 && !fromDom; i++) {
      await page.waitForTimeout(1_000);
      fromDom = await scrapeEphemeralFromDom(page);
    }
    if (fromDom) {
      return {
        messageId: msg.id,
        success: true,
        source: fromDom.source,
        content: fromDom.content,
        embedTitle: fromDom.embedTitle,
        embedDescription: fromDom.embedDescription,
      };
    }

    return { messageId: msg.id, success: false, error: "no content after unlock click" };
  } finally {
    await dismissDiscordOverlay(page);
  }
}

export function createInteractionPendingMap(): Map<string, PendingInteraction> {
  return new Map();
}

/** Click all visible Unlock buttons in the channel (DOM-only spike fallback). */
export async function clickAllVisibleUnlockButtons(page: Page): Promise<number> {
  const buttons = page.getByRole("button", { name: UNLOCK_LABEL_RE });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    try {
      await buttons.nth(i).scrollIntoViewIfNeeded();
      await buttons.nth(i).click({ timeout: 5_000 });
      await page.waitForTimeout(1_500);
    } catch {
      // button may disappear after click
    }
  }
  return count;
}

async function oldestVisibleMessageId(page: Page, channelId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const nodes = document.querySelectorAll(`[data-list-item-id*="chat-messages-${id}"]`);
    for (let i = 0; i < nodes.length; i++) {
      const listId = nodes[i].getAttribute("data-list-item-id") ?? "";
      const m = listId.match(/-(\d{17,20})$/);
      if (m) return m[1];
    }
    return null;
  }, channelId);
}

/**
 * Scroll up until loaded history reaches maxAgeMs, or Discord has no more to load.
 * Without maxAgeMs falls back to a few fixed steps (spike tooling).
 */
export async function scrollChannelToLoadHistory(
  page: Page,
  channelId?: string,
  maxAgeMs?: number,
): Promise<void> {
  const scroller = page.locator('[class*="scroller"][class*="auto"]').first();
  if ((await scroller.count()) === 0) return;

  if (!channelId || maxAgeMs === undefined) {
    for (let i = 0; i < 4; i++) {
      await scroller.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.waitForTimeout(800);
    }
    return;
  }

  const maxSteps = 40;
  let prevOldestId: string | null = null;

  for (let i = 0; i < maxSteps; i++) {
    const oldestId = await oldestVisibleMessageId(page, channelId);
    if (oldestId && isMessageOlderThan(oldestId, maxAgeMs)) break;
    if (oldestId && oldestId === prevOldestId && i > 0) break;
    prevOldestId = oldestId;

    await scroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(800);
  }
}

async function clickJumpToPresentIfVisible(page: Page): Promise<boolean> {
  const jump = page.locator('div[class*="jumpToPresentBar"] button').first();
  if ((await jump.count()) === 0) return false;
  try {
    if (config.discordKeepBackground) {
      await jump.evaluate((el) => (el as HTMLElement).click());
    } else {
      await jump.click({ timeout: 3_000 });
    }
    await page.waitForTimeout(600);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return to the live edge of the channel. Discord virtualizes messages, so a
 * single scrollTop = scrollHeight often leaves the "Jump to Present" bar up.
 */
export async function scrollChannelToPresent(page: Page): Promise<void> {
  const scroller = page.locator('[class*="scroller"][class*="auto"]').first();
  if ((await scroller.count()) === 0) return;

  for (let i = 0; i < 6; i++) {
    if (await clickJumpToPresentIfVisible(page)) continue;

    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(600);

    if ((await page.locator('div[class*="jumpToPresentBar"]').count()) === 0) break;
  }

  if (!config.discordKeepBackground) {
    await scroller.click({ timeout: 2_000 }).catch(() => {});
    await page.keyboard.press("End").catch(() => {});
  } else {
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  }
  await page.waitForTimeout(400);
}

/** @deprecated Use scrollChannelToPresent — kept for call sites. */
export async function scrollChannelToBottom(page: Page): Promise<void> {
  await scrollChannelToPresent(page);
}

export function resolveInteractionPending(
  pending: Map<string, PendingInteraction>,
  messageId: string | null,
  content: UnlockedContent,
): void {
  if (messageId && pending.has(messageId)) {
    pending.get(messageId)!.resolve(content);
    return;
  }
  // No message_id on the response: only resolve when exactly one unlock is in
  // flight (unlocks are serialized), otherwise we cannot safely attribute it.
  if (!messageId && pending.size === 1) {
    const only = pending.entries().next();
    if (!only.done) only.value[1].resolve(content);
  }
}
