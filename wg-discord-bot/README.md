# WG Discord → Binance Bot

Discord → Binance copy bot: dual-channel watcher (`#trades` unlock + DCA limits, `#active-alerts` urgent actions).

## Setup

**Requires Node.js 18+** (use `nvm use` in this directory — `.nvmrc` has `20`).

```bash
cd wg-discord-bot
nvm use          # or: nvm install 20
cp .env.example .env
# Fill DISCORD_GUILD_ID, DISCORD_TRADES_CHANNEL_ID, DISCORD_ALERTS_CHANNEL_ID
npm install
npx playwright install chromium
npm test         # parser unit smoke test (no Discord needed)
```

## Phase 0 — Discord capture spike

### 0. Auto-fill channel IDs (optional)

```bash
npm run discord:discover
```

Opens Chromium — log in if needed, click Wealth Group server. Writes guild + `#trades` + `#active-alerts` IDs to `.env`.

### 1. One-time login (headed browser)

```bash
npm run discord:login
```

Log in, open Wealth Group, close browser. Session saved to `data/discord-profile/`.

### 2. Run spike (headless, 60s)

```bash
npm run spike
```

Captures messages via WebSocket Gateway + REST backfill. Results in `spike-output/spike-*.json`.

### Success criteria

- `GO`: WG Bot messages captured from watched channels
- `PARTIAL`: messages but no WG Bot (check `WG_BOT_DISPLAY_NAME`)
- `NO-GO`: zero messages (session expired or wrong channel IDs)

## Phase 0b — Unlock Content spike

`#trades` signals are behind an **Unlock Content** button (ephemeral — only visible after click).

```bash
npm run spike:unlock
```

Opens `#trades` in a **headed** browser, auto-clicks unlock teasers, captures interaction response + DOM fallback. Results in `spike-output/spike-unlock-*.json`.

Default: `SPIKE_DURATION_MS=0` — listens **until you press Ctrl+C** (or until unlock succeeds). Set e.g. `600000` for 10-minute timeout.

### Success criteria

- `GO`: unlock succeeds, trade text extracted (interaction or DOM)
- `PARTIAL`: no new teasers during run (retry when WG Bot posts)
- `NO-GO`: teasers seen but unlock always fails

## Env

| Variable | Description |
|----------|-------------|
| `DISCORD_GUILD_ID` | Server ID (Dev Mode → Copy Server ID) |
| `DISCORD_TRADES_CHANNEL_ID` | `#trades` channel ID |
| `DISCORD_ALERTS_CHANNEL_ID` | `#active-alerts` channel ID |
| `WG_BOT_DISPLAY_NAME` | Default: `WG Bot` |
| `FOLLOWED_TRADERS` | Default: `Johnny,Woods,Eli,Michele,-Tareeq,Astekz` — exact `@mention` spelling |
| `DRY_RUN` | Default: `true` — log plans without Binance orders |
| `DCA_WEIGHTS` | Default: `25,35,40` — DCA ladder weights |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Futures API (testnet default) |

## Watcher (parser + DCA + alerts)

```bash
npm run discord:pick -- alerts   # if DISCORD_ALERTS_CHANNEL_ID empty
npm run watch                    # dual-tab watcher, DRY_RUN by default
npm run dashboard                # http://localhost:3847 — trade journal UI
```

**Node 20 required** — run `nvm use` in `wg-discord-bot/` first (see `.nvmrc`). Without it, `tsx` fails with `SyntaxError: Unexpected token '.'`.

- **#trades**: unlock teaser → parse limit signal → 3-step DCA plan → journal (`data/trades.db`)
- **#active-alerts**: urgent queue (cancel, SL move, market close) — always ahead of trade queue

**Személyes trader csatornák** (`#johnny`, `#eli`, `#woods`, stb.) **nincsenek figyelve** — csak a közös `#trades` (új jelek) és `#active-alerts` (TP/SL/stop). A `FOLLOWED_TRADERS` lista azt szűri, mely `@mention` traderek postjait dolgozzuk fel **a #trades csatornában** (`.env`-ben `@` nélkül: `Johnny`, `-Tareeq`, …).

### Trade journal (`data/trades.db`)

| Tábla | Tartalom |
|-------|----------|
| `open_trades` | Felismert és journalba tett trade-ek (entry, SL, státusz, lábak) |
| `trade_legs` | DCA limit lábak |
| `trade_events` | Minden esemény: `trade_created`, `alert_no_trade`, `immediate_close`, stb. |

A terminálon látható sok `[alert] no open trade` = **3 napos backfill** újrajátssza a régi alerteket, de nincs hozzá nyitott trade a journalban → `alert_no_trade` eseményként mentődik. Ez nem „talált trade”, hanem régi alert replay.

Dashboard: külön terminálban `npm run dashboard` → nyitott trade-ek, journal, eseménylog, manuális gombok (Close, Cancel limit, SL→BE).
