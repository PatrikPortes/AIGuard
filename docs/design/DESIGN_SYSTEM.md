# Věřím tomu? — design systém

> Stav: **F1 — design foundation** (sjednoceno s [FRONTEND_DESIGN_DIRECTION.md](FRONTEND_DESIGN_DIRECTION.md)).
> Tento dokument definuje tokeny, primitiva a implementační pravidla. UX, layout, interakce a responzivní chování určuje FRONTEND_DESIGN_DIRECTION.md.

## Pořadí autority

1. **`docs/design/VERIM_CHARACTER_REFERENCE.png`** — závazný vzhled Věrky a Roba.
2. **`docs/design/FRONTEND_DESIGN_DIRECTION.md`** — závazné UX, layout, interakce, responzivní chování a produktový směr frontendu.
3. **`docs/design/DESIGN_SYSTEM.md`** (tento dokument) — tokeny, komponenty a implementační primitiva.
4. **`docs/design/VERIM_VISUAL_REFERENCE.png`** — původní vizuální a layoutová inspirace.

Při rozporu v UX nebo layoutu má přednost FRONTEND_DESIGN_DIRECTION.md. Pokud by token zde odporoval požadavku přístupnosti ve FRONTEND_DESIGN_DIRECTION.md §16, platí požadavek přístupnosti a tento dokument se upraví.

Obě originální PNG reference jsou uložené beze změny; velikosti a SHA-256 jsou v [ASSETS.md](ASSETS.md). Reference se nesmějí upravovat, překreslovat, převzorkovat ani komprimovat. Styleboard není obrázek určený k vložení do stránky. Character sheet **není sprite sheet**; z žádné reference se nesmějí vystřihovat produkční postavy ani jiné assety. Produkční ilustrace musí být dodány jako samostatné schválené soubory.

## Identita a tón

- Kanonický název produktu je **Věřím tomu?**; tagline **Radši ověřit než litovat.** Homepage používá od F2 název „Věřím tomu?“. Starší „Věřím?“ zůstává ještě na privacy stránce a sjednotí se v F11.
- Věřím tomu? **není AI detektor**, ale průvodce bezpečným rozhodnutím. Nikdy nenaznačuje jistotu, kterou analýza nemá: „nenašli jsme problém“ ≠ „je to bezpečné“.
- Čeština s **vykáním všude** — v uvítání, formuláři, výsledcích i chybách. Žádné tykání.
- Jednoduchý jazyk je **výchozí stav**. Neexistuje samostatný „jednoduchý“ ani „senior“ režim. Technické detaily patří pod „Chci vědět víc“.
- Klidný, lidský, ilustrovaný styl: ne dětský, ne kyberpunk, ne antivirový dashboard, ne alarmistický. Ilustrace vysvětluje, typografie informuje.

Věrka je hlavní digitální průvodkyně. Robo je sekundární pomocník reprezentující práci systému. Robo nevede rozhovor s uživatelem. Věrka není reálná osoba ani tvrzení, že zprávu posoudil člověk. Animace nesmí předstírat operace, které neproběhly.

## Barvy

Všechny poměry kontrastu jsou měřené nástrojem `scripts/contrast-check.js` (vzorec WCAG 2.x). Barva nikdy sama nenese význam — každý stav má text a případně ikonu.

### Identita a plochy

| Token | Hodnota | Použití | Kontrast |
|---|---|---|---|
| `--cream` | `#FFFCE5` | Kanonické pozadí stránky (FDD §5.3) | — |
| `--surface` | `#FFFFFF` | Karty, bubliny | — |
| `--ink` | `#0F1B3D` | Základní text | 16,32:1 na cream, 16,87:1 na bílé |
| `--muted` | `#3F4C63` | Sekundární text | 7,58–8,66:1 na všech plochách |
| `--brand-action` | `#3F35B8` | Primární tlačítka, odkazy, značka „?“ | bílý text 8,70:1; na cream 8,42:1 |
| `--brand-action-hover` | `#362DA3` | Hover primární akce | — |
| `--brand` | `#6C63FF` | **Pouze dekorace** (tečky, pruhy, rámečky). Nikdy text nesoucí informaci | 4,17:1 na cream (jako grafika ≥ 3:1) |
| `--accent` | `#38BDF8` | Robova modrá, **pouze dekorace**, nikdy jediný nositel významu | 2,07:1 — nesmí nést informaci |
| `--focus-ring` | `#3730A3` | Viditelný fokus klávesnice (3–4 px) | ≥ 8,69:1 na všech plochách |
| `--field-border` | `#7A7596` | Hranice formulářových polí (2 px) | ≥ 3,82:1 na všech plochách |
| `--disabled` | `#55506E` | Pozadí neaktivního tlačítka | bílý text 7,61:1 |
| `--brand-soft`, `--blue-soft`, `--cool-background`, `--border` | `#F0EEFF`, `#EEF8FF`, `#F8FAFF`, `#E5E3F0` | Jemné plochy a dekorativní rámečky | text `--ink` ≥ 14,77:1 |

### Rodiny výsledků (FDD §10)

Výsledky mají **dvě rodiny**, nikoli jednu lineární škálu. Rodina „znalost“ nesmí vypadat jako „bezpečný konec“ rodiny „obava“. Obava nesmí být poplašně červená. Rodiny se vždy rozlišují také textem a ikonou, nikdy jen barvou.

| Rodina | Token | Hodnota | Kontrast |
|---|---|---|---|
| **Obava** (Velmi podezřelé, Zbystřete) | `--concern-ink` (text) | `#7C3F0B` | 7,89:1 cream · 8,16:1 bílá · 7,29:1 na `--concern-surface` |
| | `--concern-accent` (ikony a rámečky, **ne text**) | `#B45309` | 4,48–5,02:1 |
| | `--concern-surface` | `#FDF1D8` | `--ink` 15,07:1 |
| **Znalost** (Nenašli jsme jasné varovné znaky, Nemáme dost informací) | `--knowledge-ink` (text) | `#3F4F66` | 8,05:1 cream · 8,33:1 bílá · 7,41:1 na `--knowledge-surface` |
| | `--knowledge-accent` (ikony a rámečky, **ne text**) | `#56677F` | ≥ 5,05:1 |
| | `--knowledge-surface` | `#EEF2F7` | `--ink` 15,01:1 |
| **Dokončený bezpečný krok uživatele** | `--safe-action-ink` (text) | `#14532D` | 8,81:1 cream · 9,11:1 bílá · 8,10:1 na `--safe-action-surface` |
| | `--safe-action-accent` (ikony a rámečky) | `#15803D` | ≥ 4,39:1 |
| | `--safe-action-surface` | `#E7F5EC` | — |

Pravidla:

- **Zelená je vyhrazena výhradně pro dokončený bezpečný krok uživatele** (FDD §12.3). Nikdy ji nepoužívat pro výsledek analýzy.
- Žádný výsledek analýzy nemá „úspěšný“ ani uklidňující vzhled. Neexistuje stav „nízké riziko“.
- `#B45309` (návrh z FDD §5.3) dosahuje na `#FFFCE5` jen 4,86:1, proto se používá pouze pro ikony a rámečky. Esenciální text používá `--concern-ink`.
- Technické chyby, kapacita a timeout jsou klidná systémová informace (plochy rodiny „znalost“ nebo `--blue-soft`), nikoli červený poplach.

**Zastaralé aliasy** (zachované kvůli kompatibilitě a měřicím nástrojům, nepoužívat pro novou práci):

- `--success` → `--safe-action-accent`
- `--attention`, `--risk` → `--concern-accent`
- `--amber-soft` → `--concern-surface`
- `--risk-soft`, `--mint-soft` → `--knowledge-surface`
- `--muted-reference` `#64748B` je pouze referenční šedá ze styleboardu a v UI se nepoužívá.

## Typografie, prostor a tvary

| Token / pravidlo | Hodnota |
|---|---|
| Kořenová velikost písma | `112.5 %` — 18 px při výchozím nastavení prohlížeče, respektuje uživatelskou velikost písma |
| `--text-body` | `1rem` (18 px) — **minimum pro veškerý čitelný text**, včetně popisků, nápověd, štítků a patičky |
| `--text-result` | `1.125rem` (~20 px) — text orientovaný na výsledek (souhrn, seznamy výsledku) |
| Výška řádku | `1.6` (požadavek ≥ 1,5) |
| `--measure` | `65ch` — maximální šířka běžného textu |
| `--target-min` | `48px` — minimální efektivní cíl dotyku |
| `--target-primary` | `56px` — primární akce |
| Fokus | `3px` (tlačítka a pole `4px`) `--focus-ring`, odsazení `3px` |
| Pole formuláře | rámeček `2px` `--field-border` |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px |
| Radius | 12 px ovládání, 20 px bubliny, 28 px velké karty |
| Stín | `0 12px 36px rgb(35 27 93 / 7%)` |

- Bez dodaného licencovaného fontu se používá systémový sans-serif (`ui-rounded`, poté běžné systémové fonty). Žádné externí fonty ani CDN.
- **Žádné ručně psané ani skriptové písmo** pro text, popisky, vstupy ani tlačítka. Ručně kreslená vrstva (zvýraznění, šipky, kroužky) je pouze dekorativní nebo zdvojující a přijde v pozdějších etapách.
- Checkbox má viditelnou velikost 24 px. Jeho efektivní cíl ≥ 48 px zajišťuje celý popisek (`label`).

### Pozadí a papírová textura

- Pozadí stránky je `--cream`.
- Volitelná papírová textura je **pouze CSS**, extrémně jemná (≤ 1,2 % inkoustu), umístěná za veškerým obsahem (`body::before`, `z-index: -1`) a nikdy na předcích textu.
- Žádné obrázky ani `data:` URI (CSP `img-src 'self'`).
- Při `prefers-contrast: more` a při tisku je textura vypnutá.
- Konečná intenzita textury je položkou validace na reálných telefonech (FDD TBD).

### Pohyb

- Žádná podstatná informace nezávisí na animaci; stav vždy nese text.
- Při `prefers-reduced-motion: reduce` se dekorativní animace a přechody vypínají. Indikátor průběhu se zobrazí staticky.

## Komponenty a chování (stav po F1)

F1 mění pouze tokeny a CSS primitiva. Markup a chování se mění až v dalších etapách. Současné starší vzory zůstávají v HTML/JS do své etapy:

| Současný vzor v markupu | Cílový stav | Etapa |
|---|---|---|
| Značka „Věřím?“, tykání v hero a bublině | **Hotovo v F2** na homepage (privacy stránka: F11) | F2 |
| Hero s velkou společnou ilustrací před nástrojem | **Hotovo v F2**: nástroj je hero, Věrka i Robo zachováni (viz níže) | F2 |
| Ruční výběr typu obsahu | Jedno pole s automatickou detekcí, výběr jen jako oprava | Hotovo v F3 (bez opravného výběru; viz „Vstup (F3)“) |
| Kruhové číselné skóre („/ 100“) | **Neodstraňuje se v F1.** Číselné skóre se uživatelům nezobrazuje (ani pod „Chci vědět víc“), pokud to později výslovně neschválí product owner | F5 |
| Přepínač „Vysvětlit jednoduše“ (checkbox) | Jednoduchý jazyk jako výchozí stav, tlačítko „Vysvětlit jednoduše“ jen uvnitř technické sekce | F5 |
| Mapování `risk_level` na vzhled | Autoritativní sémantický výsledek z backendového kontraktu C4. Frontend sám neodvozuje konečný výsledek pro nejednoznačné případy | F5 + C4 |

V F1 jsou stávající stavy výsledku vizuálně převedeny na rodiny tokenů: `caution`, `high` a `very_high` používají rodinu **obava** a `unassessed` rodinu **znalost**. Zelená a poplašná červená z výsledků zmizely. Jde pouze o vizuální základ, nikoli o finální model čtyř výsledků.

Další pravidla:

- Doporučené kroky nejsou dokončený bezpečný krok, proto nejsou zelené.
- Ukázkový příklad „Běžná zpráva“ nemá zelené ani „bezpečné“ zbarvení.
- Chybový panel je klidná systémová informace.
- Privacy stránka používá stejné tokeny. Nezavádí třetí strany, externí fonty ani nové ukládání obsahu.
- Žádná tvrzení o ukládání, logování, retenci ani třetích stranách se nezobrazují, dokud nejsou ověřena proti skutečné nasazené konfiguraci.

## Homepage (F2)

Pořadí sekcí podle FDD §7:
1. hlavička se vstupem „Už se to stalo?“;
2. hero = nástroj (H1, podnadpis, formulář, primární akce) s Věrkou a Robem;
3. pás „Už se to stalo?“;
4. typické situace;
5. jak to funguje;
6. co umíme a co neumíme;
7. patička.

**Kompozice postav: varianta B — dva samostatné schválené assety** `verka-welcome` a `robo-default` místo společného `verkarob`. Důvody:
- nezávislé responzivní umístění;
- stavy „welcome“ a „default“ odpovídají FDD §6.3 (společný hero zobrazuje Věrku s nápadem a zamyšleného Roba, obě postavy oříznuté v pase);
- 257 784 B místo 702 152 B.

Oba obrázky se zobrazují celé (`object-fit: contain`, původní poměr stran), bez ořezu, filtru i nové kresby. `verkarob` zůstává schváleným assetem, ale homepage ho od F2 nepoužívá.

Responzivita:
- Na desktopu a tabletu stojí postavy vedle nástroje.
- Na mobilu následují hned za nástrojem. První obrazovka 360×640 obsahuje účel stránky, pole pro zprávu i primární akci.
- Pod 700 px se sekundární odkazy hlavičky přesouvají do patičky.
- Pod 600 px se slogan v hlavičce skrývá; zůstává ve stránce a na desktopu.
- Pod 360 px se hlavička zalamuje do dvou řádků.

Obsahová omezení:
- Pás „Už se to stalo?“ obsahuje jen pravdivý stav „připravujeme“. Nouzové pokyny až po nezávislém ověření (F9).
- Sekce schopností uvádí jen skutečně dostupné vstupy (text, URL). Snímek obrazovky a PDF jsou „zatím nedostupné“; zvuk a video nepodporujeme.
- Žádná nová tvrzení o soukromí.

## Vstup (F3)

Uživatel nevybírá typ obsahu. Formulář má jedno pole „Obsah k ověření“ a jednu primární akci. Nápověda pod polem říká, co lze vložit: text zprávy, e-mailu nebo SMS, případně samotný odkaz.

**Směrování text/URL** (`classifyInput` v `public/app.js`) je jen volba existujícího typu API, ne analýza. Neurčuje riziko ani bezpečnost; vstup vždy ověřuje backend. Pravidlo:
- Hodnotu oříznout o okrajové mezery.
- `url` jen tehdy, když celá hodnota je jedna adresa bez mezer, začíná `http://` nebo `https://` (bez ohledu na velikost písmen), `new URL()` ji přijme, má hostitele a nemá přihlašovací údaje.
- Vše ostatní je `text`: běžný text, text s odkazem, více odkazů, holá doména (`example.com`), Markdown odkaz, schémata `javascript:`, `data:`, `file:`, `ftp:` a adresy se jménem a heslem.

Při nejistotě vždy `text`. Frontend adresu neotevírá, nenačítá, nezobrazuje jako odkaz a nevkládá do URL, historie ani refereru.

**Dočasné řešení:** podporované vstupy (text, URL) jsou zatím dané frontendem. Až backend poskytne autoritativní přehled schopností (kontrakt C1), musí ho frontend číst místo tohoto pravidla. Nedostupné vstupy (snímek obrazovky, PDF) a nepodporované (zvuk, video) jsou uvedeny jen textem; nemají žádné ovládací prvky.

Pole má `spellcheck="false"` a `autocomplete="off"`, aby prohlížeč vložený text nenabízel k automatické kontrole pravopisu ani k uložení. Vkládání je nativní; stránka nečte schránku a nežádá o oprávnění. Na mobilu je pole vyšší (7,5 rem), primární akce zůstává na první obrazovce 360×640.

## Načítání, chyby a obnova (F4)

**Načítání.** Po odeslání tlačítko zůstává zaměřené, změní text na „Prověřuji…“ a má `aria-disabled="true"`. Opakované odeslání se ignoruje, takže odchází jen jeden požadavek. Formulář má `aria-busy="true"`. Pod tlačítkem se zobrazí Robo (`robo-analyzing`) s textem „Prověřuji zadaný obsah… Chvíli prosím počkejte.“ a neurčitým pruhem bez procent a bez vymyšlených kroků. Pruh se při `prefers-reduced-motion: reduce` nepohybuje. Stejný text oznamuje čtečkám `#status` (`role="status"`); vizuálně je během načítání skrytý, aby se nezdvojoval.

**Chyby.** Mapování vychází jen z existujících kódů backendu (`src/server.js`) a z chyb na straně prohlížeče:

| Druh | Kódy | Postava | Nabídka |
|---|---|---|---|
| Upravit obsah | `INVALID_INPUT`, `AI_INPUT_LIMIT`, `BODY_TOO_LARGE`, `AI_CONSENT_REQUIRED` | Věrka `warning` | Upravit zprávu |
| Počkat | `RATE_LIMITED` (i 429 bez JSON), `AI_OVERLOADED`, `AI_CAPACITY_EXHAUSTED`, `BOT_CHECK_REQUIRED` | Robo `capacity` | Upravit zprávu; bez „Zkusit znovu“ |
| Zkusit znovu | `AI_TIMEOUT`, `REQUEST_TIMEOUT`, výpadek sítě, vypršení 35 s v prohlížeči, neúplná odpověď, ostatní kódy a odpovědi bez JSON | Robo `error` | Zkusit znovu, Upravit zprávu |
| Obnovit relaci | `SESSION_REQUIRED`, selhání `/api/session` při načtení | Robo `error` | Zkusit znovu (nejdřív obnoví relaci) |

Každá chyba má nadpis, vysvětlení a větu „Výsledek teď nemáme. Neznamená to, že je zpráva bezpečná.“ Texty jsou pevné ve frontendu; text chyby ze serveru ani vložený obsah se nezobrazují. Chyba je v `role="alert"`, posune se do zorného pole, ale fokus zůstává na tlačítku. Obsah pole zůstává. Nic se neopakuje automaticky; „Zkusit znovu“ odešle stejný obsah jen po kliknutí. Pod 400 px se postava v panelech řadí nad text.

## Kanonické postavy a role

Vzhled určuje `docs/design/VERIM_CHARACTER_REFERENCE.png`. Každá produkční varianta musí zachovat stejný výtvarný styl, proporce, obličej, barvy a znak štítu na oblečení. Znak je součástí schválené kresby a nemění se. Samostatné assety a jejich stav jsou v [ASSETS.md](ASSETS.md).

### Věrka — HUMAN-FACING GUIDE

Hlavní digitální průvodkyně: mladá přátelská kreslená postava, hnědé vlasy v charakteristickém vysokém drdolu, velké hnědé oči, fialovo-modrá mikina se znakem štítu, klidný a důvěryhodný výraz. Vítá, ptá se, vysvětluje, upozorňuje, doporučuje další postup, provází výsledky a dává pozitivní feedback **pouze po dokončeném bezpečném kroku uživatele**.

| Stav | Použití |
|---|---|
| `default` | Výchozí přítomnost průvodkyně |
| `welcome` | Přivítání a první krok |
| `thinking` | Chybějící kontext, přemýšlení nad vysvětlením, výsledky rodiny „znalost“ |
| `question` | Doplňující otázka uživateli |
| `explaining` | Vysvětlení signálů, výsledku a doporučení |
| `warning` | Srozumitelné upozornění, výsledky rodiny „obava“ |
| `success` | Pouze dokončení bezpečného kroku uživatele, nikdy potvrzení pravosti nebo bezpečnosti zprávy |
| `thumbsup` | Povzbuzení po bezpečném kroku |

### Robo — SYSTEM / ANALYSIS ASSISTANT

Sekundární technický pomocník: malý bílý robot, tmavý obličej/displej, modré a cyan prvky, znak štítu, přátelský vzhled a konzistentní proporce. Reprezentuje práci systému: loading, analýzu, hledání, technický progress, systémové informace, kapacitu a technické chyby. **Nesmí nahradit Věrku jako hlavní komunikační postavu.**

| Stav | Použití |
|---|---|
| `default` | Výchozí systémový pomocník |
| `analyzing` | Skutečně běžící analýza / loading |
| `searching` | Skutečně běžící hledání nebo kontrola; neimplikuje otevírání podezřelých URL |
| `warning` | Systémové upozornění nebo omezení |
| `success` | Úspěšně dokončená systémová operace, nikdy záruka bezpečnosti obsahu |
| `tip` | Doplňková systémová informace |
| `capacity` | Dostupná nebo vyčerpaná kapacita systému / rozpočtu |
| `error` | Technické selhání |

### Produkční soubory a placeholdery

- Produkční assety a jejich optimalizované WebP delivery verze eviduje [ASSETS.md](ASSETS.md).
- Nevytvářet alternativní podobu Věrky ani Roba, negenerovat nové varianty a nevystřihovat z character sheetu.
- CSS, emoji ani externí ikony nesmějí nahrazovat produkční postavy.
- Chybějící stavy (Věrka `default`, `question`, `thumbsup`) zůstávají bez nového assetu, dokud nejsou dodány a schváleny.

## Technická hranice

- Frontendové etapy mění `public/` (kromě `public/character-assets.js`, který server používá pro allowlist a integritu) a dokumentaci v `docs/design/`.
- Scoring, provider, queue, rozpočet, rate limity, CSRF/session, prompt, schema, safety layer, CSP, statický allowlist a API zůstávají beze změny.
- Externí AI se nezapíná.
- Každý nový statický soubor nebo nová stránka vyžaduje samostatnou serverovou změnu, kterou provádí a reviduje Codex (plán C7).
- Měření a ověřování popisuje [FRONTEND_TEST_PLAN.md](FRONTEND_TEST_PLAN.md).
