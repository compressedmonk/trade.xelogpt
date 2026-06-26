import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Extract user token from an existing Playwright Discord profile (e.g. wg-discord-bot). */
async function main(): Promise<void> {
  const profileArg = process.argv[2];
  const profileDir = resolve(
    profileArg ?? "../wg-discord-bot/data/discord-profile",
  );

  if (!existsSync(profileDir)) {
    console.error(`Profile not found: ${profileDir}`);
    process.exit(1);
  }

  let captured = "";
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  context.on("request", (request) => {
    if (!request.url().includes("discord.com/api")) return;
    const auth = request.headers()["authorization"];
    if (auth && !auth.startsWith("Bearer") && auth.length > 20) captured = auth;
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://discord.com/channels/@me", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(5_000);

  if (!captured) {
    captured = await page
      .evaluate(() => {
        try {
          const raw = localStorage.getItem("token");
          if (!raw) return "";
          const parsed = JSON.parse(raw) as unknown;
          return typeof parsed === "string" ? parsed : "";
        } catch {
          return "";
        }
      })
      .catch(() => "");
  }

  await context.close();

  if (!captured) {
    console.error("No token found — run wg-discord-bot `npm run discord:login` first.");
    process.exit(1);
  }

  console.log(captured);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
