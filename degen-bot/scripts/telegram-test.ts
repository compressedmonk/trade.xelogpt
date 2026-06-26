import { assertTradeConfig } from "../src/config.js";
import { formatBootMessage, sendTelegram } from "../src/telegram.js";

async function main(): Promise<void> {
  assertTradeConfig();
  const ok = await sendTelegram(formatBootMessage());
  if (ok) {
    console.log("Telegram test message sent.");
  } else {
    console.error("Failed to send Telegram message — check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
