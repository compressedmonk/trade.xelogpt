import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { config } from "../src/config.js";

/**
 * Opens a real browser, lets you log in to Discord, and captures the user
 * session token from the Authorization header of an API request. Paste the
 * printed token into .env as DISCORD_USER_TOKEN.
 */
async function main(): Promise<void> {
  await mkdir(config.profileDir, { recursive: true });

  console.log("Opening Discord login browser...");
  console.log(`Profile dir: ${config.profileDir}`);
  console.log("1. Log in to Discord (email + password + 2FA if needed)");
  console.log("2. Once your servers load, the token is captured automatically");
  console.log("3. Copy the printed token into .env (DISCORD_USER_TOKEN), then close the window\n");

  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  let captured = "";
  context.on("request", (request) => {
    const url = request.url();
    if (!url.includes("discord.com/api")) return;
    const auth = request.headers()["authorization"];
    if (auth && auth !== captured && !auth.startsWith("Bearer")) {
      captured = auth;
      console.log("\n=== DISCORD_USER_TOKEN ===");
      console.log(auth);
      console.log("==========================\n");
    }
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://discord.com/app", { waitUntil: "domcontentloaded" });

  await new Promise<void>((resolve) => {
    context.on("close", () => resolve());
  });

  if (!captured) {
    console.log("No token captured — make sure you fully logged in and opened a server.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
