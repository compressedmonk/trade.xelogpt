import type { Page } from "playwright";
import { channelUrl, config } from "../config.js";
import { isUnlockInProgress } from "./unlock-guard.js";
import { scrollChannelToLoadHistory, scrollChannelToPresent } from "./unlock.js";
import { log } from "../util/logger.js";

/** Force Discord to re-fetch /messages via scroll + optional reload. */
export async function backfillChannelMessages(
  page: Page,
  channelId: string,
  reload = false,
): Promise<void> {
  if (isUnlockInProgress()) return;
  if (reload) {
    log.trade(`backfill reload ${channelId}`);
    await page.goto(channelUrl(channelId), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2_500);
  }

  log.trade(`backfill scroll ${channelId} (max ${config.backfillMaxAgeDays}d)`);
  await scrollChannelToLoadHistory(page, channelId, config.backfillMaxAgeMs);
  await page.waitForTimeout(2_000);
  // Return to the live edge so unlock buttons stay in the viewport and the
  // "Jump to Present" bar does not linger after backfill.
  await scrollChannelToPresent(page);
}
