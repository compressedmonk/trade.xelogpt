import { config } from "../config.js";

/**
 * Resolves the Discord user session token. Currently sourced from
 * DISCORD_USER_TOKEN; populate it with `npm run discord:login`, which captures
 * the Authorization header from a logged-in session.
 */
export function resolveUserToken(): string {
  if (config.userToken) return config.userToken;
  throw new Error(
    "DISCORD_USER_TOKEN not set — run `npm run discord:login` and paste the token into .env",
  );
}
