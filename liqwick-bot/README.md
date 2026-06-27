# LiqWick Bot

**Regime Liq Wick** — Binance Futures bot: BTC 4H bull/bear gate + intrabar liquidation wick belépés.

## Gyors indítás (ThinkPad / lokál)

```bash
cd /home/t/projectek/gmgncopy/liqwick-bot
nvm use              # Node 20 — kötelező
npm run setup        # npm install + .env létrehozás
npm start
```

Dashboard: **http://localhost:3850**

Alapból **`DRY_RUN=true`** — jelet detektál és naplóz, de nem küld éles ordert.

## Parancsok

| Parancs | Mit csinál |
|---------|------------|
| `npm run setup` | Függőségek + `.env` (ha hiányzik) |
| `npm start` | Bot + WebSocket + dashboard |
| `npm test` | Stratégia unit tesztek |
| `npm run dashboard` | Csak dashboard (journal olvasás) |
| `npm run analyze` | Sweep journal riport + opcionális CSV export |
| `npm run backup-db` | WAL-safe SQLite backup (`data/backups/`) |

## Adattárolás és optimization workflow

A bot **SQLite**-ban tartja az adatokat: `data/liqwick.db` (`DB_PATH` env). Nincs automatikus törlés — addig megmarad, amíg a fájl él.

| Tábla | Tartalom |
|-------|----------|
| `sweep_journal` | Minden sweep (outcome, score, depth, funding, …) — **fő elemzési forrás** |
| `signal_events` | Triggerelt jelek |
| `positions` | Nyitott/zárt pozíciók |
| `bot_events` | Regime váltás, abort, hibák |

**Kötelező beállítások forward teszthez:**

```env
DRY_RUN=true
JOURNAL_ENABLED=true
```

### Napi backup (VPS)

```bash
# Egyszeri backup
npm run backup-db

# Cron — minden nap 03:00 (liqwick user)
0 3 * * * cd /opt/liqwick-bot && JOURNAL_RETENTION_DAYS=30 bash scripts/backup-db.sh >> /var/log/liqwick-backup.log 2>&1
```

Backup helye: `data/backups/liqwick-YYYY-MM-DD.db`. `JOURNAL_RETENTION_DAYS=0` = soha ne töröljön régi backupot.

### Heti elemzés (1–4 hét után)

```bash
# Utolsó 7 nap riport
npm run analyze -- --since $(date -d '7 days ago' +%Y-%m-%d)

# Konkrét időszak + CSV export
npm run analyze -- --since 2026-06-01 --until 2026-06-28 --csv exports/june.csv
```

Dashboard: **http://localhost:3850** — Period / Outcome / Symbol szűrők, 200 sor journal.

API példák:

```bash
curl 'http://localhost:3850/api/sweep-journal?limit=500&since=2026-06-01'
curl 'http://localhost:3850/api/optimization?since=2026-06-01'
curl 'http://localhost:3850/api/optimization/weekly?since=2026-06-01'
```

### Mit nézz a riportban?

| Jelenség | Mit jelent | Env finomhangolás |
|----------|------------|-------------------|
| Sok `aborted_continuation` / `depth_exceeded` | Ár túl messzire ment — breakout, nem wick | `SWEEP_ATR_K` (trigger + 4× limit) |
| Sok `timeout_no_reversal` | Score elég, de nem fordult vissza időben | `REVERSAL_ATR_K`, `SWEEP_TIMEOUT_MS` |
| Sok near miss (peak 45–59) | Közel volt, de nem triggerelt | `ENTER_THRESHOLD` lejjebb |
| Symbolonként 0 trigger | Gyenge coin vagy rossz regime illeszkedés | `SYMBOL_WHITELIST` szűkítés |
| Sok `blocked_low_score` | Confluence komponensek gyengék | confluence súlyok / `LIQ_BURST_MULT` |

### Ajánlott heti rutin

1. `npm run backup-db`
2. `npm run analyze -- --since <7 napja>`
3. Dashboard: Period = Last 7 days, Outcome szűrők
4. `.env` módosítás VPS-en → `systemctl restart liqwick-bot`
5. Következő héten ugyanazzal a `--since/--until` ablakkal összehasonlítás

## Stratégia röviden

| Réteg | Szabály |
|-------|---------|
| **Regime** | BTC 4H EMA200 — BULL / BEAR / NEUTRAL |
| **BULL** | Csak LONG — lefelé liq wick sweep + velocity |
| **BEAR** | Csak SHORT — felfelé squeeze wick + velocity |
| **Belépés** | Intrabar (~0.5–2 mp), market order |
| **SL** | Wick extremitás ± buffer |
| **TP** | 2R |

## Éles futtatás

1. `.env`-ben: `DRY_RUN=false`
2. Binance Futures API kulcsok (`BINANCE_API_KEY`, `BINANCE_API_SECRET`)
3. Kezdd **testneten**: `BINANCE_TESTNET=true`
4. Mainnet csak dry-run log után

## VPS deploy (systemd + nginx dashboard)

```bash
# Lokál → VPS (exclude .env, data, node_modules)
rsync -avz --delete \
  --exclude node_modules --exclude data --exclude .env \
  liqwick-bot/ root@185.222.242.201:/tmp/liqwick-bot/

ssh root@185.222.242.201 'bash /tmp/liqwick-bot/deploy/install.sh && systemctl restart liqwick-bot'
```

Dashboard: **https://trade.xelogpt.com/liqwick/** (nginx) vagy **https://liqwick.xelogpt.com/** (subdomain, DNS kell)

Manuális telepítés:

```bash
sudo bash liqwick-bot/deploy/install.sh
sudo systemctl restart liqwick-bot
sudo journalctl -u liqwick-bot -f
```

## Fájlok

- `src/strategy/wick-monitor.ts` — WebSocket intrabar detektálás
- `src/regime/detector.ts` — BTC regime
- `src/executor/open-position.ts` — Binance végrehajtás
- `data/liqwick.db` — SQLite journal

## Reuse

Binance kliens és risk minta: `wg-discord-bot/` (Discord réteg nélkül).
