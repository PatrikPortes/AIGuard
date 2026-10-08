# Věřím? — evidence designových assetů

Vizuální pravidla: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Uložené canonical references

| Reference | Cesta | Účel | Velikost | SHA-256 |
|---|---|---|---|---|
| Visual reference | `docs/design/VERIM_VISUAL_REFERENCE.png` | Layout, UI, barvy a celkový vizuální styl | 2 271 157 bajtů | `de9df4c1fb675ecad70ada53e2bdc3984f2971e42693bdc4782ef2817548fef4` |
| Character reference | `docs/design/VERIM_CHARACTER_REFERENCE.png` | Kanonický vzhled, role, proporce a stavy Věrky a Roba | 2 734 785 bajtů | `d08da8919f8e55ff7f6ca8ac594b0c36f44a7f886d8dcfa5e3b24a96ef7b2db1` |

Oba PNG jsou uložené beze změny originálu. Zdroj: `Unknown.png` z `Unknown.png.zip` a `Unknown-2.png` z `Unknown-2.png.zip`. Při rozporu má character reference prioritu pro postavy, visual reference pro layout/UI. Reference se uchovávají jako dlouhodobé originály, ne jako frontendové produkční assety. Character reference není sprite sheet.

## Canonical production character assets

**Aktuální sada obsahuje 14 schválených canonical production assetů.** `Archiv 2.zip` nahradil 11 jednotlivých PNG z původního `Archiv.zip` a dodal nový společný hero `verkarob.png`. `verka-welcome.png` a `verka-thinking.png` nebyly v nové dodávce a zůstávají beze změny. Originální názvy a PNG bytes jsou zachované. Jen tyto jednotlivé soubory jsou určené přímo pro UI; character sheet zůstává referencí. Netvořit alternativní postavy, neprovádět výřezy ani jejich vzhled nahrazovat emoji či generickými ilustracemi. Chybějící stavy zůstávají bez nového assetu; pokud by pro ně vznikla komponenta, použije současný označený placeholder.

Preferovaný formát dalších dodávek zůstává transparentní WebP nebo PNG podle výsledné kvality a velikosti. Existující dodané soubory se nekonvertují ani nekomprimují bez dalšího pokynu.

### Věrka — hlavní komunikační průvodkyně

Hnědé vlasy ve vysokém drdolu, velké hnědé oči, fialovo-modrá mikina, štít Věřím?, přátelský a klidný cartoon vzhled. Použití: uvítání, otázky, vysvětlení, upozornění, doporučení, výsledky a pozitivní feedback.

| Soubor / chybějící basename | Stav | Současné použití |
|---|---|---|
| `public/assets/characters/verka/verka-default` | Chybí | Výchozí průvodkyně |
| `public/assets/characters/verka/verka-welcome.png` | Dodáno a schváleno | Schválený welcome stav, nyní bez samostatného použití; hero používá společný `verkarob.png` |
| `public/assets/characters/verka/verka-thinking.png` | Dodáno a schváleno | Karta výsledku: zvýšená opatrnost / vysoká nejistota |
| `public/assets/characters/verka/verka-question` | Chybí | Doplňující otázka |
| `public/assets/characters/verka/verka-explaining.png` | Dodáno a schváleno | Věrčin souhrn výsledku |
| `public/assets/characters/verka/verka-warning.png` | Dodáno a schváleno | Karta vysokého rizika a vstupní upozornění |
| `public/assets/characters/verka/verka-success.png` | Dodáno a schváleno | Karta nižšího rizika; neznamená potvrzení bezpečnosti |
| `public/assets/characters/verka/verka-thumbsup` | Chybí | Povzbuzení |

### Robo — sekundární systémový pomocník

Malý bílý robot s tmavým obličejem/displejem, modrými/cyan prvky a štítem Věřím?. Použití: loading, analýza, hledání, technický progress, systémové informace, kapacita a technické chyby; nikdy náhrada Věrky v hlavní komunikaci.

| Soubor / chybějící basename | Stav | Současné použití |
|---|---|---|
| `public/assets/characters/robo/robo-default.png` | Dodáno a schváleno | Schválený neutrální stav, nyní bez samostatného použití; v hero je Robo součástí `verkarob.png` |
| `public/assets/characters/robo/robo-analyzing.png` | Dodáno a schváleno | Existující loading při probíhajícím požadavku |
| `public/assets/characters/robo/robo-searching.png` | Dodáno a schváleno | Dodáno, zatím nepoužito — neexistuje odpovídající hledání |
| `public/assets/characters/robo/robo-warning.png` | Dodáno a schváleno | Hlavička nalezených signálů |
| `public/assets/characters/robo/robo-success.png` | Dodáno a schváleno | Dokončená kontrola; také hlavička bez nalezených signálů |
| `public/assets/characters/robo/robo-tip.png` | Dodáno a schváleno | Existující blok bezpečného nezávislého ověření |
| `public/assets/characters/robo/robo-capacity.png` | Dodáno a schváleno | Existující error blok při vyčerpané kapacitě, přetížení nebo rate limitu |
| `public/assets/characters/robo/robo-error.png` | Dodáno a schváleno | Existující error blok při technické / síťové chybě |

Success u obou postav nesmí znamenat záruku pravosti nebo bezpečnosti posuzovaného obsahu. Význam stavu musí doprovázet srozumitelný text.

## CANONICAL HERO CHARACTER ASSET

**Dodáno a schváleno:** `public/assets/characters/verkarob.png`, původní člen `verkarob.png` z `Archiv 2.zip`. Věrka dostala nápad, Robo přemýšlí; postavy stojí zády k sobě. Jde o hlavní společnou ilustraci značky, nikoli nový komunikační nebo analytický stav.

Použití: `public/index.html`, hero u hlavního nadpisu, `.hero-character img`; URL `/assets/characters/verkarob.png`. Nahrazuje samostatný welcome portrét a doprovodný Robo default obrázek pouze v hero. Věrčina uvítací bublina, nadpis a CTA zůstávají. Desktop: text a ilustrace vedle sebe, obrázek maximálně 420 px široký. Mobile 390/320 px: ilustrace pod textem a CTA, maximálně 280 px široká, vždy uvnitř dostupné šířky. Cream pozadí stránky prosvítá skutečným alfa kanálem. Celé plátno se zobrazuje s `height:auto` a `object-fit:contain`, bez ořezu, deformace, filtrů nebo maskování.

Významový český alt je uveden právě jednou: „Věrka a Robo – průvodci bezpečným ověřováním digitálního obsahu“. Hero obrázek nemá `aria-hidden`; další duplicitní popisek není přidán.

## Další produkční assety

| Asset | Stav | Požadovaný výstup / účel |
|---|---|---|
| Wordmark Věřím? + shield | Chybí | Samostatné autorizované SVG a PNG s průhledností; plná i kompaktní varianta; favicon. Do té doby skutečný textový wordmark. |
| Hlavní hero / portrétní exporty Věrky a Roba | Dodaná sada zapojena | Hero používá společný `verkarob.png`; kompaktní bloky používají celé dodané obrázky se zachovaným poměrem stran. Optimalizované menší exporty zatím chybí. |
| Volitelné detailní výrazy a zadní pohled | Chybí, neblokuje | Samostatné autorizované exporty podle character reference; mimo povinný seznam 16 stavů. |
| Volitelné prostředí / hero pozadí | Chybí, neblokuje | Schválená samostatná ilustrace krémového přátelského prostředí; žádný výřez reference. |
| Font | Zatím systémový | Případný odsouhlasený WOFF2 s českou diakritikou a doloženou licencí; bez externího CDN. |
| UI ikony | Dočasné textové značky | Produkční konzistentní SVG sada pro ovládání a kategorie; žádné vystřihování z referencí. UI ikony nejsou náhrada postav. |

## Předání a omezení

U každého assetu dodat verzi, původ/autora, oprávnění k veřejnému použití, rozměry, schválené použití a popis pro přístupnost. Každá postava musí zachovat shodnou kresbu, proporce a identitu napříč všemi stavy. Doporučený master: Věrka 1200 px na delší hraně, Robo 800 px; avatary ideálně 512 px se stejným bezpečným ořezovým prostorem. Tyto rozměry jsou požadavkem na budoucí exporty, ne instrukcí k úpravě originálních referencí.

**Nevystřihovat postavy z character sheetu, negenerovat alternativní podobu a nenahrazovat postavy CSS/emoji/externími ikonami.** Používat výhradně dodané schválené obrázky; současný označený placeholder ponechat pouze pro chybějící konkrétní asset. Reference a produkční assety jsou rozdílné soubory. Napojení mění jen existující komponenty; nevytváří nové business flow.


## Technická kontrola dodané sady — Phase 3

Zdroj opravených souborů a hero: `Archiv 2.zip`. Všech 12 dodaných PNG prošlo dekódováním a kontrolou ZIP CRC; uložené soubory jsou bytově totožné se ZIP členy. macOS resource forks nejsou produkční assety a nebyly importovány. Aktuální sada obsahuje 14 PNG, celkem 23 659 415 bajtů. Zachován originální pixelový obsah, rozměry i barevný režim; žádné převzorkování, změna kresby nebo komprese.

Cesty jednotlivých stavů: `public/assets/characters/verka/` a `public/assets/characters/robo/`; společný hero: `public/assets/characters/verkarob.png`.

| Soubor | Rozměry | Bajtů | Průhlednost | Schválení / dodávka | SHA-256 |
|---|---|---|---|---|---|
| `robo-analyzing.png` | 1145 × 1374 | 1409392 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `2e3e2a293dd19debdb4c214d4635ce1a9bfe779fc55c63d3d67fda645cd721d0` |
| `robo-capacity.png` | 1145 × 1374 | 1554288 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `a8122bd98079d9967f9949632ea6d8dab80f7777a4b693b5edf13200676783b0` |
| `robo-default.png` | 1145 × 1374 | 1401716 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `ef61184e0144ceb72a4d678a3aa54f1a9ead5f7eb5025ce1c95d887cc7794d3e` |
| `robo-error.png` | 1145 × 1374 | 1548547 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `b3a5b0abaed26b99b0460722b3b8c771edf6a1bd5e4df166ef3549271e144a5e` |
| `robo-searching.png` | 1145 × 1374 | 1482353 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `e8d99aae8923e26f818793efe05bc9a398429d36d22ee2e61a01e8f778be4f03` |
| `robo-success.png` | 1145 × 1374 | 1517245 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `0f2343cba4a3a18612df16b971f828c9ad2e8fd40107e34c31745a4397e9e56c` |
| `robo-tip.png` | 1145 × 1374 | 1653998 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `0cba81ef2a164c2b3ed974a3ad1e7992a41055d5c865fcee94ff514179fd4e21` |
| `robo-warning.png` | 1145 × 1374 | 1633183 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `a4672f2a541a370a36a50d3d198db0517fe01a6da270d5ccbda21c769ae48d99` |
| `verka-explaining.png` | 1145 × 1374 | 1796632 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `997fb89230479a41312dbe88a72fb6053a23d28097f5a85f50b66851ef501e9a` |
| `verka-success.png` | 1145 × 1374 | 1838111 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `4f2f4482f6aa5740b4c25c796bf2ff7230b1ece044cdcf8757e113451b02ecca` |
| `verka-thinking.png` | 1145 × 1374 | 1916893 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; ponecháno z Archiv.zip | `15dcb1664094fb458527542d021c220738bafcba30674af53ac95484e7a214bd` |
| `verka-warning.png` | 1145 × 1374 | 1791426 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; opraveno z Archiv 2.zip | `68520c03383fa0d04e4eee25c39687fe014f3e109d70d1db74e8aa1c143611d6` |
| `verka-welcome.png` | 1295 × 1214 | 1922221 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; ponecháno z Archiv.zip | `3e85af706b0cc309d4066cf41213073b51b618f05829ab87b93b482b0ddf6ec0` |
| `verkarob.png` | 1312 × 1199 | 2193410 | RGBA; alfa 0–255; skutečná průhlednost | Schváleno; nový hero z Archiv 2.zip | `b4387d12a8d19338e613e877efcfd6379edf300ac79a518cb4af7a39fd226af4` |

### Transparentnost a technické limity

Všech 14 PNG má skutečný alfa kanál, zcela transparentní pixely (alfa 0) i poloprůhledné části kresby. U každého souboru byla zkontrolována distribuce alfa hodnot a rohové oblasti pozadí. Při vizuální kontrole všech 14 celých obrázků na cream pozadí nebyla nalezena vypálená šachovnice. Původní problém 11 neprůhledných RGB exportů byl odstraněn dodáním opravených originálů, nikoli úpravou v aplikaci. Aplikace alfa hodnoty ani obsah obrázků nemění.

Soubory mají přibližně 1,4–2,2 MB; menší schválené exporty mohou později pomoci mobilnímu načítání. Tato etapa originály nekonvertuje. Hero má `fetchpriority="high"` a uvedené intrinsické rozměry; vedlejší a skryté obrázky používají lazy loading. Škálování vždy používá celé obrázky s `height:auto` a `object-fit:contain`. Žádný nový technický problém bránící použití nebyl nalezen.

### Přístupnost a statické napojení

Hero má výše uvedený významový český `alt`. Postavy v ostatních existujících blocích mají `alt=""` a `aria-hidden="true"`: jsou dekorativní doprovod vedle čitelného jména, zprávy nebo textového stavu. Riziko, kapacita a chyba zůstávají explicitním textem, nikoli významem obrázku. Zachovány role `status`, `alert`, focus na výsledku a klávesnicové ovládání. Error blok rozlišuje Věrčino vstupní upozornění a Robovu kapacitu/technickou chybu bez změny API rozhodování.

Statický server má **14 konkrétních schválených PNG** v explicitním allowlistu s MIME `image/png`. Jediná serverová změna této etapy je přidání přesné cesty `/assets/characters/verkarob.png`; původních 13 povolených cest zůstává. Žádný `/assets/**` wildcard ani obecný přístup do filesystemu. Neschválené soubory a designové reference zůstávají přes HTTP nepřístupné. `robo-searching.png` je schválený, ale aplikace nemá odpovídající hledání a nepředstírá ho.

### Výsledek kontrol

`npm test`: 40/40 prošlo, 0 selhalo a 0 přeskočeno. HTTP test ověřuje všech 14 schválených obrázků: HTTP 200, přesnou shodu servírovaných bytes, MIME `image/png`, `nosniff` a odmítnutí neschválených/private/traversal cest. `npm run check` prošlo.

Chromium/Playwright smoke test prošel na desktopu 1440/1024 px, tabletu 768 px a mobilech 390/320 px. Hero i celá homepage jsou bez vodorovného přetékání; CTA zůstává dostupné, obrázek má původní poměr stran, `contain`, transparentní okolí a žádný ořez. Vizuálně zkontrolovány screenshoty desktopu, 390/320 px a galerie všech 14 assetů na cream pozadí.

Přístupnost: prošla kontrola českého alt textu hero bez duplikace, dekorativních alt/ARIA ostatních postav, jazyka dokumentu, jednoho hlavního nadpisu, popisků vstupů, stavových a chybových rolí, skip linku a klávesnicového odeslání. Jde o cílenou kontrolu přístupnosti integrace, nikoli úplný audit WCAG. Ověřeny existující stavy analyzing, vysoké/nižší riziko, nejistota, capacity, error, vstupní upozornění, návrat po chybě a jednoduché vysvětlení. Technické chyby a kapacita byly simulovány pouze pro test UI. 0 JS chyb, 0 chyb obrázků, 0 externích webových požadavků. Testovací runtime používal rules; externí AI nebyla zapnuta.

`DESIGN_SYSTEM.md`, canonical references, frontendová business logika, backend API, rules engine, AI pipeline, bezpečnostní limity a budget controller zůstaly beze změny. Žádný deployment ani push.

**PHASE 3 CHARACTER ASSETS: PASS**
