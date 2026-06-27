# LiqWick — Optimization workflow (1–4 hét forward teszt)

Ez a dokumentum leírja, **pontosan hogyan** gyűjtünk adatot DRY_RUN módban, hogyan ellenőrizzük hogy működik, és hogyan elemezzük 1–4 hét múlva a sweep journalt a stratégia finomhangolásához.

---

## 1. Előfeltételek

| Beállítás | Érték | Miért kell |
|-----------|-------|------------|
| `DRY_RUN=true` | Igen | Mainnet adat, de nincs valódi order |
| `JOURNAL_ENABLED=true` | Igen | Sweep journal írás — **nélküle nincs elemzés** |
| `BINANCE_TESTNET=false` | Ajánlott | Valódi likviditás / funding / force order adat |
| Node.js | 20+ | `nvm use` a `liqwick-bot/` mappában |

Adatbázis helye:

- **VPS (éles forward teszt):** `/opt/liqwick-bot/data/liqwick.db`
- **Lokál:** `liqwick-bot/data/liqwick.db`

---

## 2. Ellenőrzés — fut-e a loggolás?

Ezt **hetente egyszer** (vagy gyanú esetén azonnal) futtasd.

### VPS (ajánlott — itt gyűlik a forward teszt adat)

```bash
ssh root@185.222.242.201

# 1) Service fut-e?
systemctl is-active liqwick-bot
# elvárt: active

# 2) Journal be van-e kapcsolva?
grep JOURNAL_ENABLED /opt/liqwick-bot/.env
# elvárt: JOURNAL_ENABLED=true

# 3) Van-e friss adat a DB-ben?
sqlite3 /opt/liqwick-bot/data/liqwick.db \
  "SELECT COUNT(*) AS total, MAX(created_at) AS utolso FROM sweep_journal;"

# 4) Utolsó 3 sweep
sqlite3 /opt/liqwick-bot/data/liqwick.db \
  "SELECT created_at, symbol, outcome, peak_score, block_reason
   FROM sweep_journal ORDER BY created_at DESC LIMIT 3;"

# 5) Élő log (Ctrl+C kilép)
journalctl -u liqwick-bot -f
# elvárt: [journal] SYMBOL outcome peak=... sorok sweep eseményekkor
```

**Egészséges állapot:**

- `active` + `JOURNAL_ENABLED=true`
- `utolso` időbélyeg **ma vagy tegnap** (ha piac aktív)
- `total` szám **nő** napról napra
- journalctl-ben `[journal]` sorok megjelennek

### Ha nem fut — indítás / újraindítás (VPS)

```bash
ssh root@185.222.242.201

# Indítás
systemctl start liqwick-bot

# Újraindítás (pl. .env módosítás után)
systemctl restart liqwick-bot

# Státusz + utolsó hibák
systemctl status liqwick-bot
journalctl -u liqwick-bot -n 30 --no-pager
```

### Lokál (opcionális, fejlesztéshez)

```bash
cd /home/t/projectek/gmgncopy/liqwick-bot
nvm use
npm start
# Dashboard: http://localhost:3850
```

Ellenőrzés:

```bash
sqlite3 data/liqwick.db "SELECT COUNT(*), MAX(created_at) FROM sweep_journal;"
```

---

## 3. Adatgyűjtés — mi kerül a DB-be?

Minden **lezárt sweep** egy sor a `sweep_journal` táblában:

| Mező | Jelentés |
|------|----------|
| `outcome` | `triggered`, `aborted_continuation`, `aborted_timeout`, `blocked_*`, … |
| `block_reason` | pl. `depth_exceeded`, `timeout_no_reversal`, `peak_58_lt_60` |
| `peak_score` / `final_score` | Confluence pont sweep alatt / lezáráskor |
| `depth_atr` / `max_depth_atr` | Csapás mélység ATR-ben |
| `funding_rate`, `liq_burst_ratio` | Kontextus |
| `score_breakdown` | JSON — komponens bontás (L, S, V, G, …) |

**Nincs automatikus törlés** — az adat addig megmarad, amíg a `liqwick.db` fájl megvan.

---

## 4. Heti rutin (1–4 hét forward teszt alatt)

Minden **héten**, ugyanazon a napon (pl. vasárnap):

### 4.1 Backup

**VPS:**

```bash
ssh root@185.222.242.201
cd /opt/liqwick-bot
sudo -u liqwick bash scripts/backup-db.sh
ls -la data/backups/
```

Backup fájl: `data/backups/liqwick-YYYY-MM-DD.db`

Automatikus backup **cron** (VPS-en beállítva):

```
0 3 * * * cd /opt/liqwick-bot && sudo -u liqwick JOURNAL_RETENTION_DAYS=30 bash scripts/backup-db.sh >> /var/log/liqwick-backup.log 2>&1
```

Log ellenőrzés: `tail /var/log/liqwick-backup.log`

**Lokál:**

```bash
cd liqwick-bot
npm run backup-db
```

### 4.2 Riport (CLI)

**VPS:**

```bash
ssh root@185.222.242.201
cd /opt/liqwick-bot
sudo -u liqwick npm run analyze -- --since $(date -d '7 days ago' +%Y-%m-%d)
```

**Lokál:**

```bash
cd liqwick-bot
npm run analyze -- --since $(date -d '7 days ago' +%Y-%m-%d)
```

Hasznos variációk:

```bash
# 14 nap
npm run analyze -- --since $(date -d '14 days ago' +%Y-%m-%d)

# Konkrét hét + CSV export
npm run analyze -- --since 2026-06-22 --until 2026-06-28 --csv exports/week1.csv

# Csak ETH continuation esetek
npm run analyze -- --since 2026-06-01 --symbol ETHUSDT --outcome aborted_continuation
```

A riport végén **Tuning hints** sorok jelennek meg — ezeket olvasd el.

### 4.3 Dashboard

Nyisd meg: **https://trade.xelogpt.com/liqwick/**

1. **Period** → `Last 7 days` (vagy 14 / 30)
2. **Outcome** → pl. csak `aborted_continuation` ha continuation-t hangolsz
3. **Symbol** → coinonkénti bontás
4. **Apply** gomb
5. Nézd az opt stat kártyákat (Total sweeps, Near misses, Aborts, Avg peak score)
6. Journal táblában: **Depth** (lezáráskori) vs **Max depth** (sweep max)

### 4.4 Döntés és finomhangolás

A riport + dashboard alapján döntsd el, mit változtatsz. **Egyszerre csak 1–2 paramétert** állíts!

| Ha ezt látod | Mit próbálj | Env változó |
|--------------|-------------|-------------|
| Sok `aborted_continuation` (>50%) | Lazítani a continuation limitet, vagy szigorúbb sweep trigger | `SWEEP_ATR_K` |
| Sok `timeout_no_reversal`, jó peak score | Több idő reversalre | `SWEEP_TIMEOUT_MS`, `REVERSAL_ATR_K` |
| Sok near miss (peak 45–59) | Alacsonyabb belépési küszöb | `ENTER_THRESHOLD` |
| 0 trigger egy symbolnál | Coin kiesik a whitelistből | `SYMBOL_WHITELIST` |
| Minden sweep alacsony peak | Likvid / volume komponensek gyengék | `LIQ_BURST_MULT`, `VOL_SPIKE_MULT` |

**.env módosítás VPS-en:**

```bash
ssh root@185.222.242.201
nano /opt/liqwick-bot/.env
# pl. ENTER_THRESHOLD=55
systemctl restart liqwick-bot
systemctl is-active liqwick-bot
```

**Fontos:** a változtatás **előtti** hetet mentsd el riporttal (`--since/--until`), hogy össze tudd hasonlítani az **utána** lévő héttel.

---

## 5. Időzítés — mikor elemezzünk?

| Időpont | Mit csinálj |
|---------|-------------|
| **Most (nap 0)** | Ellenőrizd: bot fut, journal nő (2. fejezet) |
| **1 hét múlva** | Első riport + dashboard 7 nap — baseline megvan |
| **2 hét múlva** | Második riport, összehasonlítás az 1. héttel; első finomhangolás ha van minta |
| **3–4 hét múlva** | Stabil minták, döntés: éles teszt (`DRY_RUN=false`) vagy további hangolás |

Minimum **1 hét** adat kell értelmes döntéshez. **2–4 hét** ajánlott mielőtt élesre váltasz.

---

## 6. API referencia (scriptekhez / curl)

```bash
# Sweep lista (max 500 sor, utolsó 7 nap)
curl 'https://trade.xelogpt.com/liqwick/api/sweep-journal?limit=500&since=2026-06-20'

# Összesítő stat időablakra
curl 'https://trade.xelogpt.com/liqwick/api/optimization?since=2026-06-20'

# Heti bontás
curl 'https://trade.xelogpt.com/liqwick/api/optimization/weekly?since=2026-06-01'
```

Lokálisan: cseréld a hostot `http://localhost:3850`-re.

---

## 7. Gyors ellenőrzőlista (másolható)

```
[ ] systemctl is-active liqwick-bot → active
[ ] JOURNAL_ENABLED=true a .env-ben
[ ] sweep_journal COUNT nő (sqlite3 lekérdezés)
[ ] journalctl -u liqwick-bot → [journal] sorok
[ ] npm run backup-db (hetente)
[ ] npm run analyze -- --since $(date -d '7 days ago' +%Y-%m-%d)
[ ] Dashboard: Period=7d, Outcome/ Symbol szűrők
[ ] Döntés: max 1-2 env paraméter módosítás
[ ] systemctl restart liqwick-bot
[ ] Következő héten ugyanaz a riport — összehasonlítás
```

---

## 8. Hibaelhárítás

| Probléma | Megoldás |
|----------|----------|
| `npm run analyze` → „Database not found” | Bot még nem futott — `npm start` vagy VPS-en `systemctl start liqwick-bot` |
| `no sweep_journal table` | Bot nem hozta létre a sémát — indítsd egyszer |
| `total` nem nő napok óta | `systemctl status liqwick-bot`; regime `NEUTRAL`? (akkor kevesebb sweep); WS down? |
| Dashboard üres journal | `JOURNAL_ENABLED=false` — állítsd `true`-ra, restart |
| Backup: „sqlite3 required” | VPS: `apt install sqlite3` |
| Deploy után adat megmaradt? | Igen — `data/` nincs felülírva rsync-nél |

---

## 9. Kapcsolódó fájlok

| Fájl | Szerep |
|------|--------|
| `liqwick-bot/.env` / VPS: `/opt/liqwick-bot/.env` | Futási beállítások |
| `liqwick-bot/data/liqwick.db` | Journal adatbázis |
| `liqwick-bot/scripts/backup-db.sh` | Backup script |
| `liqwick-bot/scripts/analyze-journal.mjs` | CLI riport |
| `liqwick-bot/README.md` | Gyors indítás, deploy |

---

*Utolsó ellenőrzés (VPS): bot `active`, `JOURNAL_ENABLED=true`, journal aktívan íródik.*
