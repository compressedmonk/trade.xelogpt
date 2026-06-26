# Discord csatorna kereső: SOL CA-k megtalálása

> Hogyan keress Solana contract address-eket (CA-kat) egy Discord csatorna előzményeiben a beépített keresővel.

---

## Fontos korlát

A Discord kereső **nem tud regex-et**, és **nincs** olyan beépített szűrője, mint „csak base58 cím”. Egyetlen keresőkifejezéssel **nem lehet** garantálni, hogy *kizárólag* nyers Solana CA üzenetek jelenjenek meg (pl. `7HgfXftRBBqsYtAEYcqjGLQrNJLL6Tww9ek4rE3Apump`).

A repó [`degen-bot/src/discord/ca-filter.ts`](../degen-bot/src/discord/ca-filter.ts) ezt a formát várja élő figyelésnél: **az egész üzenet = csak a CA** (32–44 base58 karakter). A fő app [`src/lib/mention-parser.ts`](../src/lib/mention-parser.ts) emellett linkből is kinyeri a címet (`pump.fun`, `dexscreener.com/solana`).

---

## Hogyan állítsd be a keresést

1. Nyisd meg a csatornát.
2. Kattints a keresőre (Ctrl+K / felső keresősáv).
3. Válaszd: **„Search in #csatorna-név”** (vagy írd: `in:#csatorna-név`).
4. Opcionálisan szűrj felhasználóra: `from:@név`.

---

## 1. Csak pump.fun stílusú CA-k (…pump végződés)

A `…Apump` formátum tipikus **pump.fun vanity** cím — a végén `pump` van.

**Legjobb egyetlen szűrő:**

```text
in:#csatorna-név pump
```

Ez megtalálja:

- nyers CA üzeneteket, amik `pump`-ra végződnek
- `pump.fun/...` linkeket
- szöveges „pump” említéseket is (hamis találat)

**Hamis találatok csökkentése** (ha sok zaj van):

```text
in:#csatorna-név pump -pumping -pumped
```

Vagy csak linkek:

```text
in:#csatorna-név pump.fun
```

Megjegyzés: a `pump` keresés **nem** találja meg azokat a Solana CA-kat, amik **nem** `pump`-ra végződnek.

---

## 2. Az összes CA, ami a csatornán említve volt

Mivel a Discord nem ismeri fel automatikusan a base58 címeket, **több keresést** érdemes futtatni ugyanabban a csatornában, majd az eredményeket összevonni (kézzel vagy másolással).

| Mit keresel | Mit írj a keresőbe | Mit talál meg |
|---|---|---|
| pump.fun tokenek (nyers + link) | `in:#csatorna pump` | …pump címek, pump.fun URL-ek |
| pump.fun linkek külön | `in:#csatorna pump.fun` | linkes megosztások |
| Dexscreener Solana | `in:#csatorna dexscreener.com/solana` | dex linkek CA-val |
| Dexscreener általános | `in:#csatorna dexscreener` | több lánc is lehet |
| Solscan / Birdeye (ha használják) | `in:#csatorna solscan` vagy `birdeye` | explorer linkek |
| Konkrét CA visszakeresése | `in:#csatorna 7HgfXftRBBqsYtAEYcqjGLQrNJLL6Tww9ek4rE3Apump` | csak az adott cím említései |

**Nyers CA-only üzenetek** (ahol az egész üzenet csak cím, ahogy a degen-bot is várja): ezekhez nincs tökéletes Discord-szűrő. A `pump` keresés jó közelítés pump.fun csatornákon; egyébként a fenti link-keresések + konkrét címek.

---

## 3. Hasznos Discord szűrők (kiegészítő)

```text
in:#csatorna pump from:@trader
in:#csatorna pump.fun has:link
in:#csatorna pump during:2026-06
```

- `from:` — csak egy user CA-i
- `has:link` — linkes üzenetek
- `during:` / `before:` / `after:` — időszűrés

---

## 4. Mit **nem** tud a Discord kereső

- Regex: pl. „32–44 base58 karakter, semmi más szöveg” → **nincs**
- Automatikus deduplikált CA-lista export → **nincs**
- `0x…` EVM címek kiszűrése egy kattintással → **nincs**

Ha később kellene **automatikus, teljes CA-lista** a csatorna előzményeiből, az már nem Discord-kereső kérdés — a repóban jelenleg csak **élő figyelés** van ([`degen-bot/src/discord/gateway.ts`](../degen-bot/src/discord/gateway.ts)), nem keresés/backfill CA-kra.

---

## Gyors ajánlás pump.fun degen csatornához

CA-only posztok esetén futtasd ezeket sorban:

1. `in:#csatorna pump` — elsődleges szűrő
2. `in:#csatorna pump.fun` — linkes megosztások
3. `in:#csatorna dexscreener.com/solana` — ha dex linkek is mennek

Ezzel lefeded a legtöbb Solana CA említést; a maradék (nem-pump végződésű nyers címek) csak konkrét címkereséssel vagy kézi átnézéssel érhető el Discordban.
