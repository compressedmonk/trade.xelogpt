# Litt-Analyzer — Felhasználói Útmutató

> Solana meme coin trading terminal — valós idejű on-chain adatok, smart money követés, influencer elemzés

---

## Mi ez?

A Litt-Analyzer egy személyes kereskedési dashboard, ami a Solana blockchain valós idejű adatait mutatja. Az adatok a GMGN.ai rendszeréből érkeznek, ami közvetlenül a blockchainen figyeli a tranzakciókat, árfolyamokat, wallet-eket és tokeneket.

**Kinek szól:**
- Aktív tradereknek, akik meme coinokat keresnek korai fázisban
- Azoknak, akik a "smart money" (profi wallet-ek) mozgásait akarják követni
- Bárkinek, aki szeretné megérteni egy token kockázatait vásárlás előtt

**Fontos:** Ez egy elemző eszköz, nem pénzügyi tanácsadás. Minden kereskedési döntés a te felelősséged.

---

## 1. Trending — Felkapott tokenek

**Mit látsz itt:** A Solanán jelenleg legtöbbet kereskedett tokenek listáját.

### Időintervallumok

| Gomb | Mit mutat | Mikor hasznos |
|------|-----------|---------------|
| **5m** | Az utolsó 5 perc legaktívabb tokenjei | Azonnali pump/dump figyelés |
| **1h** | Az utolsó 1 óra trendjei | Leggyakrabban használt nézet |
| **24h** | Napi szinten legnagyobb volumenű tokenek | Átfogó kép, stabilabb trendek |

### Táblázat oszlopai

| Oszlop | Mit jelent | Mire figyelj |
|--------|-----------|--------------|
| **Token** | A token neve és szimbóluma. Kattintásra megnyílik a részletes oldal. | A "pump.fun" jelző azt mutatja melyik launchpadon indult. |
| **Price** | Aktuális ár dollárban | Nagyon kis árak (pl. $0.00000123) normálisak meme coinoknál |
| **MCap** | Piaci kapitalizáció — a token összes forgalomban lévő érmék összértéke | Kis MCap (<$100K) = korai, nagy mozgási potenciál, de kockázatos. Nagy MCap (>$1M) = stabilabb. |
| **Vol** | Kereskedési volumen az adott időszakban | Magas volumen = sokan kereskednek vele, van érdeklődés |
| **1h%** | Árváltozás az utolsó 1 órában | Zöld = emelkedett, piros = esett |
| **Swaps** | Vételi/eladási tranzakciók száma (pl. 123/45) | Ha sokkal több a vétel mint az eladás, az érdeklődést jelez |
| **Holders** | Hány egyedi wallet tartja a tokent | Több holder = szélesebb eloszlás, kisebb manipulációs kockázat |
| **SM** | Smart Money — hány profi trader tartja | Cián szám = smart degen, lila +NK = ismert KOL. Minél több, annál jobb jel. |
| **Rug** | Rug-pull kockázati mutató (0–100%) | Piros (>30%) = nagyon kockázatos! Sárga (10–30%) = óvatosan. Szürke (<10%) = alacsony kockázat. |
| **Signal** | Automatikus jelzés: PASS / WATCH / SKIP | Lásd alább a jelzőrendszert |
| **Age** | Mikor készült a token | 5s = 5 másodperce, 3h = 3 órája, 2d = 2 napja |

### Jelzőrendszer — PASS / WATCH / SKIP

Ez az automatikus értékelés segít gyorsan szűrni a tokeneket:

**PASS** (cián)
- A token biztonságosnak tűnik (rug ratio <20%, nincs wash trading)
- ÉS legalább az egyik igaz:
  - 3 vagy több smart money wallet tartja
  - 2 vagy több ismert KOL/influencer kereskedett vele
- *Jelentése: érdemes közelebbről megnézni*

**WATCH** (sárga)
- A token nem egyértelműen veszélyes, de nincs elég megerősítő jel
- Lehet, hogy kevés a smart money, vagy a kockázat átlagos
- *Jelentése: figyelj rá, de ne rohanj bele*

**SKIP** (piros)
- Legalább egy súlyos kockázat fennáll:
  - Rug ratio >30% (nagy a rug-pull esélye)
  - Wash trading (hamis kereskedési volumen)
  - Honeypot (nem tudod eladni ha megveszed)
- *Jelentése: kerüld el*

---

## 2. Trenches — Friss tokenek

**Mit látsz itt:** A legújabb, éppen most születő tokeneket. Ez a "lövészárok" — a legnagyobb kockázat, de a legnagyobb potenciális hozam is itt van.

### Három fül

| Fül | Mit jelent | Kockázat |
|-----|-----------|----------|
| **New** | Éppen most létrehozott tokenek, még a bonding curve-ön vannak | Nagyon magas — a legtöbb meg sem éli a következő órát |
| **Almost Bonded** | Közel vannak a bonding curve befejezéséhez | Magas — de már túlélték az első szűrést |
| **Graduated** | Befejezték a bonding curve-öt, nyílt piacon kereskedhetők | Közepes — már "valódi" tokenek, de még nagyon fiatalok |

**Mi az a bonding curve?** A Pump.fun és hasonló launchpadok úgy működnek, hogy egy token ára egy matematikai görbe mentén emelkedik ahogy egyre többen vásárolják. Amikor elér egy küszöböt ("graduate"), átkerül a szabad piacra (Raydium/Jupiter).

**Tipp:** A Trenches-ben a legtöbb token értéktelen lesz. A PASS jelzés és a smart money jelenlét itt különösen fontos szűrő.

---

## 3. Token részletes oldal

Egy token nevére kattintva megnyílik a teljes elemzés. Ez az oldal mindent megmutat amit egy kereskedési döntés előtt tudni érdemes.

### Info kártyák (felső sor)

| Kártya | Mit mutat |
|--------|-----------|
| **Liquidity** | Mennyi likviditás van a poolban — ez határozza meg mennyit tudsz venni/eladni árelcsúszás nélkül |
| **Holders** | Összes tokentartó wallet-ek száma |
| **Smart Money** | Hány profi ("smart degen") wallet tartja a tokent |
| **KOLs Trading** | Hány ismert influencer/KOL kereskedett ezzel a tokennel |
| **KOLs in Profit** | Az influencerek közül hányan vannak profitban (pl. 3/5 = 5-ből 3) |
| **KOL Conviction** | Összesített influencer meggyőződés — lásd alább |

**KOL Conviction szintek:**

| Szint | Feltétel | Jelentés |
|-------|----------|---------|
| **HIGH** | 5+ KOL kereskedik vele | Erős influencer érdeklődés — figyelj oda! |
| **MED** | 2–4 KOL | Mérsékelt érdeklődés |
| **LOW** | 1 KOL | Minimális érdeklődés |
| **—** | 0 KOL | Nincs ismert influencer |

A kártya azt is mutatja mennyi pénzt fektettek be összesen a KOL-ok ($-ban).

### Árléker (K-line chart)

Japán gyertya diagram az árfolyam alakulásáról:
- **Cián gyertya** = az ár emelkedett abban az időszakban
- **Piros gyertya** = az ár csökkent
- **Alsó oszlopok** = kereskedési volumen (mennyit kereskedtek)
- **Felbontás gombok** (1m, 5m, 15m, 1h, 4h, 1d) — válaszd ki milyen időtávon nézed

### Security Audit panel

Biztonsági ellenőrzés — minden sor egy vizsgálat, a pont színe mutatja az eredményt:

| Vizsgálat | Zöld (biztonságos) | Sárga (figyelmeztetés) | Piros (veszélyes) |
|-----------|-------------------|----------------------|-------------------|
| **Honeypot** | Nem honeypot | — | HONEYPOT — nem tudod eladni! |
| **Contract Verified** | Forráskód nyilvános | Ismeretlen | Nem elérhető |
| **Owner Renounced** | A dev lemondott az irányításról | — | A dev bármit módosíthat |
| **Mint Renounced** | Nem lehet több tokent nyomtatni | — | A dev tud hígítani |
| **Freeze Renounced** | Nem lehet wallet-eket befagyasztani | — | A dev befagyaszthat |
| **Rug Ratio** | <10% | 10–30% | >30% — nagyon kockázatos |
| **Top 10 Holders** | <20% | 20–50% | >50% — koncentrált, manipulálható |
| **Dev Status** | Eladta / Lemondott | — | Még tartja a tokenjeit |

**Tipp:** Ha bármelyik piros, kétszer gondold meg! Ha a Honeypot piros, SOHA ne vegyél belőle.

### Social & Dev panel

| Adat | Mit jelent |
|------|-----------|
| **Twitter/X** | A token hivatalos X fiókja (ha van). A követők száma is látható. |
| **Website** | Hivatalos weboldal |
| **Telegram / Discord** | Közösségi csatornák |
| **Dev tokens created** | Hány tokent hozott létre ez a fejlesztő. Ha >10, valószínűleg sorozat-deployer — óvatosan! |
| **Twitter renames** | Hányszor változtatott nevet az X fiókon — gyanús ha sokat |
| **Deleted tweets** | Törölt posztok a token X fiókjáról |
| **CTO** | "Community Takeover" — a közösség átvette a tokent a devtől |

**Risk Ratio sávok** (vizuális csíkok):
- **Insider traders** — bennfentes kereskedők aránya
- **Bundler bots** — botok aránya a tranzakciókban
- **Fresh wallets** — újonnan létrehozott wallet-ek aránya (magas = gyanús)
- **Bot degens** — automatizált kereskedő botok

### Smart Money Holders panel

Azok a profi wallet-ek, akik tartják a tokent:
- **Wallet cím** — rövidített formában
- **Részarány** — mekkora részt tartanak az összesből (%)
- **Profit** — mennyit kerestek/vesztettek eddig ($-ban, zöld/piros)

### Influencer Activity panel

Melyik ismert KOL/influencer kereskedett ezzel a tokennel:
- **X (Twitter) profil** — kattintható link az influencer profiljára
- **Tagek** — `kol` (lila) = ismert influencer, `smart_degen` (cián) = profi trader, egyéb (szürke)
- **Profit** — mennyit kerestek/vesztettek eddig (zöld = nyereség, piros = veszteség)
- **Befektetett összeg** — mennyit raktak bele $-ban

A panel tetején a **conviction szint** és az **összes befektetett összeg** látható.

### Dev Intelligence panel

A token létrehozójáról (fejlesztőjéről) szóló információk:

| Adat | Mit jelent | Mire figyelj |
|------|-----------|--------------|
| **Creator Wallet** | A dev wallet címe (Solscan linkkel) | Rákattintva megnézheted a teljes tranzakciós történetét |
| **Tokens Created** | Hány tokent hozott létre ez a wallet | Ha >5, sárgával jelölve — sorozat-deployer, óvatosan |
| **Token Status** | A dev eladta-e a tokenjeit | Zöld = "Sold/Renounced" (jó jel), Piros = "Still Holding" |
| **Dev's Best Token** | A dev legsikeresebb korábbi tokenje | Ha volt sikeres tokenje, az jó jel — de nem garancia |
| **Funding Source** | Honnan kapta a pénzt a dev wallet | Segít megérteni a dev háttértörténetét |

### Recent Signals panel

Automatikus jelzések az utóbbi időszakból:

| Jelzés | Szín | Jelentés |
|--------|------|---------|
| **SM Buy** | Cián | Smart money vásárolt — profi traderek vesznek |
| **Price Up** | Zöld | Jelentős áremelkedés |
| **ATH** | Sárga | Új all-time high (történelmi csúcs) |
| **CTO** | Lila | Community Takeover — közösségi átvétel |
| **Platform Call** | Kék | Valamilyen platform kiemelte a tokent |

---

## 4. Smart Money Feed

**Mit látsz itt:** A profi traderek és ismert influencerek valós idejű kereskedéseit.

### Két fül

| Fül | Kik ezek |
|-----|----------|
| **Smart Money** | Bizonyítottan profitábilis wallet-ek, akiket a GMGN rendszere smart degen-nek jelöl |
| **KOLs** | Ismert krypto influencerek, akiknek publikus a wallet címük |

### Táblázat oszlopai

| Oszlop | Mit jelent |
|--------|-----------|
| **Time** | Mikor történt a tranzakció (pl. "5m" = 5 perce) |
| **Wallet** | A trader wallet címe. Ha van, az X (Twitter) neve is megjelenik. |
| **Side** | **BUY** (zöld) = vásárolt, **SELL** (piros) = eladott |
| **Token** | Melyik tokent kereskedték |
| **Amount** | Mekkora összegben ($) |
| **Price** | Milyen áron |
| **Tags** | A wallet címkéi — `smart_degen` (cián) = profi, `kol` (lila) = influencer |

**Hogyan használd:**
- Ha több smart money wallet ugyanazt a tokent veszi → érdemes megnézni
- Ha egy KOL nagyobb összeget fektet be → komolyan gondolja
- Ha sok SELL látható egy tokennél → lehet, hogy kiszállnak, óvatosan

---

## 5. Copy Trade

**Mit látsz itt:** Wallet-ek követése és manuális token csere (swap) végrehajtás.

### Followed Wallets fül

1. **Wallet hozzáadása:** Add meg a követni kívánt wallet címét, adj neki nevet, állítsd be a max SOL összeget és a slippage-et
2. **Státusz:** ACTIVE (zöld) = aktív, PAUSED (szürke) = szüneteltetve
3. **Kezelés:** Szüneteltetheted vagy törölheted bármelyik követett wallet-et

### Trade Log fül

Korábbi kereskedések naplója:
- Mikor, melyik tokennel, melyik irányban (BUY/SELL), mekkora összegben
- Státusz: `pending` (sárga) → `submitted` (cián) → `confirmed` (zöld) vagy `failed` (piros)

### Manual Swap fül

Kézi token csere végrehajtása a GMGN API-n keresztül:
1. Add meg a wallet címed
2. Add meg a token contract címét
3. Válaszd ki: BUY vagy SELL
4. Add meg az összeget (SOL-ban)
5. Kattints az "Execute Swap" gombra

---

## Színkódok összefoglaló

| Szín | Jelentés | Hol látod |
|------|---------|-----------|
| **Cián** | Pozitív jel, smart money, biztonságos | PASS jelzés, Smart Money számok, KOL Conviction HIGH |
| **Zöld** | Nyereség, áremelkedés, biztonságos | Profit számok, BUY oldal, biztonságos audit pontok |
| **Piros** | Veszély, veszteség, kockázat | SKIP jelzés, Rug ratio magas, SELL oldal, negatív profit |
| **Sárga** | Figyelmeztetés, közepes kockázat | WATCH jelzés, gyanús dev aktivitás, ATH jelzés |
| **Lila** | KOL / influencer | KOL tagek, Influencer Activity panel |
| **Narancs** | Dev / fejlesztő információ | Dev Intelligence panel |
| **Szürke** | Semleges, nincs adat | Üres mezők, alacsony kockázat |

---

## Gyors döntési séma

```
Token megjelenik a Trending-en
        │
        ▼
   Signal = SKIP?  ──── IGEN ────▶  Ne foglalkozz vele
        │
       NEM
        │
        ▼
   Signal = PASS?
        │
       IGEN
        │
        ▼
   Kattints rá, nézd meg:
        │
        ├─ Security Audit → van piros pont? → Óvatosan!
        ├─ Honeypot? → SOHA ne vegyél honeypotot
        ├─ KOL Conviction → HIGH? → Erős jel
        ├─ Smart Money → tartják profik? → Jó jel
        ├─ Dev Intelligence → serial deployer? → Gyanús
        ├─ Rug Ratio → >30%? → Kerüld
        │
        ▼
   Minden rendben? → Fontold meg a beszállást
   Valamit gyanús? → Várj, vagy hagyd ki
```

---

*Litt-Analyzer — trade.xelogpt.com*
