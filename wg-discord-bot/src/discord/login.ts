import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { config } from "../config.js";

async function main(): Promise<void> {
  await mkdir(config.profileDir, { recursive: true });

  console.log("Opening Discord login browser...");
  console.log(`Profile dir: ${config.profileDir}`);
  console.log("1. Log in to Discord (email + password + 2FA if needed)");
  console.log("2. Navigate to your Wealth Group server");
  console.log("3. Close the browser window when done — session is saved\n");

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://discord.com/login", { waitUntil: "domcontentloaded" });

  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });

  console.log("Session saved. Run: npm run spike");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
