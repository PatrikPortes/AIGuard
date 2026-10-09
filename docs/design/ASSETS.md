# Věřím? — evidence designových assetů

Vizuální pravidla: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Uložené canonical references

| Reference | Cesta | Účel | Velikost | SHA-256 |
|---|---|---|---|---|
| Visual reference | `docs/design/VERIM_VISUAL_REFERENCE.png` | Layout, UI, barvy a celkový vizuální styl | 2 271 157 bajtů | `de9df4c1fb675ecad70ada53e2bdc3984f2971e42693bdc4782ef2817548fef4` |
| Character reference | `docs/design/VERIM_CHARACTER_REFERENCE.png` | Kanonický vzhled Roba; pro Věrku od refreshe 2026-10 historický materiál | 2 734 785 bajtů | `d08da8919f8e55ff7f6ca8ac594b0c36f44a7f886d8dcfa5e3b24a96ef7b2db1` |

Oba PNG jsou uložené beze změny originálu. Zdroj: `Unknown.png` z `Unknown.png.zip` a `Unknown-2.png` z `Unknown-2.png.zip`. Pro aktuální Věrku je autoritativních šest PNG refreshe níže; původní character reference je pro ni historická. Pro samostatné stavy Roba zůstává autoritativní character reference. Nová společná ilustrace je samostatně schválenou výjimkou uvedenou níže. Visual reference zůstává původní inspirací pro layout/UI; aktuální UX určuje FRONTEND_DESIGN_DIRECTION.md. Reference nejsou frontendové produkční assety ani sprite sheet.

## Canonical production character assets

**Aktuální refresh Věrky (2026-10):** pět stavů Věrky a společný obrázek jsou dodány patchem `verka-refresh-proposal.patch` s manifestem `verka-refresh-hash-manifest.json`. Těchto šest PNG je autoritativní vizuální reference Věrky. Manifest uvádí zdroj `verka.zip`, členy `verka-succes.png` → `verka-success.png` a `verka-rob.png` → `verkarob.png`; samotný archiv nebyl v dostupných předaných zdrojích nalezen, takže tento původ je deklarovaný, nikoli nezávisle potvrzený. Aktuální bytes, rozměry, alpha a SHA-256 byly nezávisle ověřeny; aktuální tabulky jsou oddělené od historické evidence níže.

**Schválení společné ilustrace vlastníkem (2026-10-09):** nový `verkarob.png`, včetně odlišného výrazu a štítu Roba, je schválený společný vizuál. Jde pouze o tuto ilustraci; samostatných osm stavů Roba (PNG i WebP a jejich mapování) zůstává bajtově beze změny. Toto výtvarné schválení není přijetím bezpečnostního rizika ani povolením deploymentu.

**Schválení současného thinking masteru vlastníkem (2026-10-09):** `verka-thinking.png` v nynější podobě 1204×1021 se SHA-256 `ba9d0901ccacf3c2ae0566cd3a3ead843694945e6ad0be358884b69b97e82e77` je schválený nový autoritativní source asset. Toto produktové rozhodnutí platí pro současný dodaný soubor; neznamená nezávislé ověření ořezu nebo zachování pixelů nedostupného originálu.

**Ořez `verka-thinking.png` — NEOVĚŘENO:** výstup má 1204×1021. Manifest deklaruje původní 1536×1024 PNG, box `[12,3,1216,1024]`, odstranění pouze alfa-0 okrajů a identitu zachovaných RGBA pixelů. Původní PNG se SHA-256 `b564d27f6cab9825663ddfe205553e8bd1db80d9ba34c88687903c4a91433a81` nebyl nalezen v dostupných archivech ani lokálních zdrojích. Rozměry boxu odpovídají výstupu, ale identita zachovaných pixelů a transparentnost odstraněných okrajů nejsou nezávisle potvrzeny.

**Aktuální sada obsahuje 14 schválených canonical production assetů:** pět nových stavů Věrky, osm nezměněných stavů Roba a nový společný obrázek. **Historie Phase 3:** `Archiv 2.zip` tehdy nahradil 11 PNG z `Archiv.zip` a přidal společný hero; tehdy ponechané welcome/thinking byly nahrazeny až nynějším refreshem. Původní hashe a výsledky těchto etap jsou zachované v historických sekcích níže. Používat pouze dodané schválené obrázky; nevytvářet vlastní varianty, další výřezy ani náhrady CSS/emoji/generickými ilustracemi. Chybějící stavy zůstávají bez nového assetu; případná komponenta použije současný označený placeholder.

Preferovaný formát dalších dodávek zůstává transparentní WebP nebo PNG podle výsledné kvality a velikosti. Existující dodané soubory se nekonvertují ani nekomprimují bez dalšího pokynu.

### Věrka — hlavní komunikační průvodkyně

Zrzavě kaštanové kudrnaté vlasy ve vysokém drdolu, kulaté brýle, velké hnědé oči, fialová mikina a štít podle schválených PNG refreshe. Použití: uvítání, otázky, vysvětlení, upozornění, doporučení a výsledky; pozitivní feedback pouze po bezpečném kroku uživatele. Červený trojúhelník je schválenou součástí warning ilustrace; další alarmující UI prvky se nepřidávají.

| Soubor / chybějící basename | Stav | Současné použití |
|---|---|---|
| `public/assets/characters/verka/verka-default` | Chybí | Výchozí průvodkyně |
| `public/assets/characters/verka/verka-welcome.png` | Dodáno a schváleno | Aktuální homepage hero: samostatný welcome portrét, `.hero-verka`, WebP z mapování |
| `public/assets/characters/verka/verka-thinking.png` | Dodáno a schváleno | V neutrálním výsledku F5a nyní nepoužito; schválený asset zůstává dostupný |
| `public/assets/characters/verka/verka-question` | Chybí | Doplňující otázka |
| `public/assets/characters/verka/verka-explaining.png` | Dodáno a schváleno | Neutrální nadpis výsledku F5a „Co jsme zjistili“ |
| `public/assets/characters/verka/verka-warning.png` | Dodáno a schváleno | Vstupní upozornění; výsledková karta rizika byla ve F5a odstraněna |
| `public/assets/characters/verka/verka-success.png` | Dodáno a schváleno | Schváleno, nyní bez verdict použití; nízké score nesmí samo aktivovat success |
| `public/assets/characters/verka/verka-thumbsup` | Chybí | Povzbuzení |

### Robo — sekundární systémový pomocník

Malý bílý robot s tmavým obličejem/displejem, modrými/cyan prvky a štítem Věřím?. Použití: loading, analýza, hledání, technický progress, systémové informace, kapacita a technické chyby; nikdy náhrada Věrky v hlavní komunikaci.

| Soubor / chybějící basename | Stav | Současné použití |
|---|---|---|
| `public/assets/characters/robo/robo-default.png` | Dodáno a schváleno | Aktuální homepage hero: samostatný `.hero-robo`; také neutrální hlavička signálů ve všech výsledcích F5a |
| `public/assets/characters/robo/robo-analyzing.png` | Dodáno a schváleno | Existující loading při probíhajícím požadavku |
| `public/assets/characters/robo/robo-searching.png` | Dodáno a schváleno | Dodáno, zatím nepoužito — neexistuje odpovídající hledání |
| `public/assets/characters/robo/robo-warning.png` | Dodáno a schváleno | Ve výsledku F5a nyní nepoužito; schválený asset zůstává dostupný |
| `public/assets/characters/robo/robo-success.png` | Dodáno a schváleno | Pouze dokončená systémová kontrola; není závěr o bezpečnosti |
| `public/assets/characters/robo/robo-tip.png` | Dodáno a schváleno | V ověřovacím bloku F5a nyní nepoužito; schválený asset zůstává dostupný |
| `public/assets/characters/robo/robo-capacity.png` | Dodáno a schváleno | Existující error blok při vyčerpané kapacitě, přetížení nebo rate limitu |
| `public/assets/characters/robo/robo-error.png` | Dodáno a schváleno | Existující error blok při technické / síťové chybě |

Success u obou postav nesmí znamenat záruku pravosti nebo bezpečnosti posuzovaného obsahu. Význam stavu musí doprovázet srozumitelný text.

## CANONICAL HERO CHARACTER ASSET

**Aktuální schválený soubor:** `public/assets/characters/verkarob.png` z refreshe, deklarovaný člen `verka-rob.png` v `verka.zip`; dodán patchem a manifestem. Věrka dostala nápad, Robo přemýšlí; postavy stojí zády k sobě. Nový výraz a štít Roba v této společné ilustraci jsou výslovně schváleny vlastníkem. Samostatné stavy Roba se nemění. Předchozí Phase 3 verze pocházela z `Archiv 2.zip`; její SHA je zachovaný v historii.

**Aktuální UI:** `public/index.html` používá samostatný pár `.hero-verka` (welcome) + `.hero-robo` (default). Společný `verkarob.png`/jeho WebP je schválený a serverem dostupný asset, ale nynější homepage jej nenačítá. Legacy URL `/assets/characters/verkarob.png` vrací 301 na přesný hash-WebP z `public/character-assets.js`. Historická Phase 3 homepage používala společný hero (`.hero-character img`, max420px desktop/max280px mobile); toto není popis současného layoutu. V této kontrole se layout ani napojení společné ilustrace nemění.

Historický a doporučený významový český alt společné ilustrace: „Věrka a Robo – průvodci bezpečným ověřováním digitálního obsahu“. Aktuální homepage má samostatné alt texty welcome/default portrétů; nepřidává se neexistující společný obrázek ani duplicitní popis.

## Další produkční assety

| Asset | Stav | Požadovaný výstup / účel |
|---|---|---|
| Wordmark Věřím? + shield | Chybí | Samostatné autorizované SVG a PNG s průhledností; plná i kompaktní varianta; favicon. Do té doby skutečný textový wordmark. |
| Hlavní hero / portrétní exporty Věrky a Roba | Dodaná sada zapojena | Homepage používá samostatný welcome/default pár; společný hero je dodaný, schválený a nyní nepoužitý. Kompaktní bloky používají celé obrázky; aktuální delivery hashe jsou níže. |
| Volitelné detailní výrazy a zadní pohled | Chybí, neblokuje | Samostatné autorizované exporty podle character reference; mimo povinný seznam 16 stavů. |
| Volitelné prostředí / hero pozadí | Chybí, neblokuje | Schválená samostatná ilustrace krémového přátelského prostředí; žádný výřez reference. |
| Font | Zatím systémový | Případný odsouhlasený WOFF2 s českou diakritikou a doloženou licencí; bez externího CDN. |
| UI ikony | Dočasné textové značky | Produkční konzistentní SVG sada pro ovládání a kategorie; žádné vystřihování z referencí. UI ikony nejsou náhrada postav. |

## Předání a omezení

U každého assetu dodat verzi, původ/autora, oprávnění k veřejnému použití, rozměry, schválené použití a popis pro přístupnost. Každá postava musí zachovat shodnou kresbu, proporce a identitu napříč všemi stavy. Doporučený master: Věrka 1200 px na delší hraně, Robo 800 px; avatary ideálně 512 px se stejným bezpečným ořezovým prostorem. Tyto rozměry jsou požadavkem na budoucí exporty, ne instrukcí k úpravě originálních referencí.

**Nevystřihovat postavy z character sheetu, negenerovat alternativní podobu a nenahrazovat postavy CSS/emoji/externími ikonami.** Používat výhradně dodané schválené obrázky; současný označený placeholder ponechat pouze pro chybějící konkrétní asset. Reference a produkční assety jsou rozdílné soubory. Napojení mění jen existující komponenty; nevytváří nové business flow.


## Aktuální technická evidence — refresh Věrky

Zdroj aktuálních šesti souborů: dodaný patch a hash manifest; `verka.zip` je deklarovaný nedostupný původ. Vizuální podoba včetně společného Roba je schválena vlastníkem. Všech šest PNG a šest WebP má skutečnou alfu 0–255 a souhlasící bytes/SHA; WebP se pixelově shodují s nezávisle LANCZOS-zmenšeným celým PNG plátnem. Původní ořez thinking zůstává neověřený, jak je uvedeno výše. Samostatných osm Robo PNG i osm WebP a obě původní reference jsou bajtově shodné s base `92c5c55047fb6f46d768d971b7710b7188e5e91e`.

| Asset | Formát | Rozměry | Bajtů | SHA-256 |
|---|---|---|---:|---|
| `verka-welcome` | PNG | 1312×1199 | 1765231 | `3da631dc0ad13ce5c3bb0c6b70088ddbbb12b237b9eb976096afd575662a4127` |
| `verka-welcome` | WebP | 384×351 | 127662 | `3b7831ccbbcf825dd0fe21982570ed75843405d16b865635d5dded574e0f1ded` |
| `verka-explaining` | PNG | 1312×1199 | 1844450 | `0f432d0b4b2f2e53e13f747d206a3a9e2aa87c2579818c29ecca7dff8321bba7` |
| `verka-explaining` | WebP | 384×351 | 121826 | `eeec7a93a44e09d692f946ae7af8993af79e73e976156140bea37e3999018021` |
| `verka-thinking` | PNG | 1204×1021 | 2140817 | `ba9d0901ccacf3c2ae0566cd3a3ead843694945e6ad0be358884b69b97e82e77` |
| `verka-thinking` | WebP | 384×326 | 101362 | `34fdaa51631be6b866f9457b130f66e29f0c7d11864b4201a8efd191037ea6aa` |
| `verka-warning` | PNG | 1312×1199 | 1908762 | `728e71dcb94311b3adf98a4051ea3db7651ed33f2132cd51ccd67dd05b6b23a6` |
| `verka-warning` | WebP | 384×351 | 145336 | `3d0b462212668cbc69ac4d1373eee5eea4637ef09fa33ac066284459851df4b2` |
| `verka-success` | PNG | 1312×1199 | 1974116 | `b42918dc01de74b1d8631658cc23b604db0c5f92cffa356dc1661ce4ddd71b61` |
| `verka-success` | WebP | 384×351 | 137826 | `a2bcee36ab02132f8d2f272b68210d255e69c13f5e9b54d2ed929b9ae1ee8578` |
| `verkarob` | PNG | 1312×1199 | 2285104 | `970380687af7664f2017ffa36fe0a9a82a93682d67a6a41f0507fdcadb75e93e` |
| `verkarob` | WebP | 840×768 | 712672 | `01ffcd184ab472461c50aaf5925a377b76a762784b5556897789ffa7a6cd29b3` |

PNG cesty: `public/assets/characters/verka/verka-{welcome,explaining,thinking,warning,success}.png` a `public/assets/characters/verkarob.png`. WebP cesty: `public/assets/characters/optimized/<asset>.<full-sha256>.webp`. Aktuální hodnoty jsou také v `public/character-assets.js`; stejné hashe ve starších historických tabulkách nadále platí pouze pro nezměněné samostatné Robo stavy.

Statický server povoluje pouze 14 konkrétních hash-WebP URL, ověřuje jejich bytes/SHA i před 304 a zachovává PNG názvy jako 301 aliasy. Šest odstraněných Věrčiných/starého společného hash-WebP URL vrací 404. Žádný wildcard, CSP změna ani nový externí request. HTML/API/JS/CSS mají no-store; hash-WebP immutable cache/ETag.

Homepage načítá welcome/default pár, nikoli společný hero. Ověřený first-view budget proto nelze přenést na případné budoucí zapojení 712672B společné ilustrace; po integraci je třeba nové měření ≤300 KiB. Samostatné schválené Věrka review F5a neobsahovalo; nynější necommitnutý integrační kandidát spojuje oba schválené směry a vyžaduje vlastní validaci. Ořez thinking zůstává nezávisle neověřený. Security Gate BLOCKED; Production BLOCKED; výtvarné schválení není povolením nasazení.

## Historická technická kontrola dodané sady — Phase 3

Tato sekce uchovává původní Phase 3 rozměry, hashe, zdroje, UI a výsledky kontrol před refreshem. Je historická; její tvrzení o aktuální sadě/hero/serveru platí k tehdejší etapě. Současný stav je uveden výše a v aktuální technické evidenci. Phase 3 test count40 není současný count.

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


## Historie — Security Remediation 1: optimalizovaná delivery

Následující evidence a hashe zachycují tehdejší optimalizaci Phase 3 masters, před novou Věrkou. Tvrzení o nezměněných PNG/reference/layoutu platí k této historické etapě; šest současných PNG/WebP je uvedeno v aktuální evidenci výše.

Výslovné zadání CR07 dovoluje technickou optimalizaci bez změny schválené identity. **14 canonical PNG masters a obě references mají stejné bytes/SHA jako schválená Phase3.** Žádná nová kresba, změna barev/proporcí/obsahu, background nebo crop. UI používá celé resize canvas v lossless transparentním WebP; master zůstává canonical.

Generator `scripts/optimize-characters.py` (development Pillow12.3.0 s WebP) resize LANCZOS max384px postavy a840px hero (2×desktop420). WebP lossless/method6/exactRGBA; decoded RGBA i alpha jsou **přesně stejné jako resized source**, cream-composite PSNR100dB. To není tvrzení o pixelové shodě s full-resolution master: mění se delivery rozlišení. Rozměry, hash filename i exact source SHA eviduje `public/character-assets.js`; původní PNG nejsou změněny ani posílány runtime.

23 659 415B originals → **2 342 188B deliveries (−90.1%)**. Hero2 193 410B → **702 152B (−68.0%)**, whole840×768 canvas, stejné contain/height:auto a layout/alt. Avatary mají rozlišení výrazně větší než CSS56–88px.

| Stav | Delivery rozměry | Bajtů | Alfa | SHA-256 / filename suffix |
|---|---|---|---|---|
| `verka-welcome` | 384×360 | 148582 | 0–255, lossless | `f068c864375dcb2103990f9860dffd1e068e0acdf627ab97248a8642ec640354` |
| `verka-thinking` | 320×384 | 134884 | 0–255, lossless | `4a840cba26f6e2aa862907afb4582c679bc1600a2e5609ce3cdcfcb924d28cd6` |
| `verka-explaining` | 320×384 | 127140 | 0–255, lossless | `4c1ae77446d72006a712dfeff21de26aab8a57e26fffce122f19f2861f010d03` |
| `verka-warning` | 320×384 | 131078 | 0–255, lossless | `59f0839a05c99cea903247c555c25c5cfed83fed83e5db633287bc9fe5544794` |
| `verka-success` | 320×384 | 137302 | 0–255, lossless | `e6240ebbe6911d3b6266e0eb03091527a1556a7442a3d3fdd9681254aea445b9` |
| `robo-default` | 320×384 | 109202 | 0–255, lossless | `f64c5d6d87350e4eb1fa8dfc7bdca42d41b00de19ad8415e053051bbd1cb1000` |
| `robo-analyzing` | 320×384 | 114018 | 0–255, lossless | `1c20d719ef4b97c671bbe2d0e64d63840c9d4852ce8948ae8c57604d21076840` |
| `robo-searching` | 320×384 | 115566 | 0–255, lossless | `53e6f779c6ce4ccf3b36b8811cb3aac2a5108d525cedbc52502cb096f43bb77f` |
| `robo-warning` | 320×384 | 124640 | 0–255, lossless | `37c31312e899c29738bf5101ffb014d14bbe25286036facba28140ed99133524` |
| `robo-success` | 320×384 | 119798 | 0–255, lossless | `bbba1df70ac193f107eef8909ec6323f445bce02e768a9e26541cf9c4b1d296c` |
| `robo-tip` | 320×384 | 129804 | 0–255, lossless | `8a6797405a618b0c403415b831cb07b93087e02079441384eb4607f9f737c7f4` |
| `robo-capacity` | 320×384 | 124188 | 0–255, lossless | `07975cf43e1b01e58edce8ed608bad8ae6a44848ee27559bd77657dc3512c8f7` |
| `robo-error` | 320×384 | 123834 | 0–255, lossless | `1d3969dcc39a89f7529f5fc13c8a3db410c0c4e616b1e3343f2b93ee1eb3f065` |
| `verkarob` | 840×768 | 702152 | 0–255, lossless | `614a99201e2d045248b08f24ba1c4443817f513ee81d34b60020ec91f2ac7bbf` |

Cesty: `public/assets/characters/optimized/<state>.<full-sha256>.webp`. UI má exact reference na aktuální hash; server povoluje pouze14 těchto přesných paths. Legacy PNG URLs vrací301 na odpovídající derivative, žádný generic wildcard. Hash-WebP mají `Cache-Control` i `Cloudflare-CDN-Cache-Control: public,max-age=31536000,immutable` a ETag; HTML/API/JS/CSS no-store. Integrity check proběhne i před304. Origin limit120requests/min burst a2MiB/min byte burst/client-/64; independent edge cache/WAF/cold-cache load je pending gate. Runtime image neobsahuje archive PNG, builder/Git je zachovává a kontroluje.

URL/no-signal/score<30 bez dostatečného závěru používá neutrální Věrka-thinking/Robo-default a text „Bezpečnost nelze určit“, nikdy Verka-success/Robo-success jako důkaz bezpečnosti. Robo-success zůstává pouze textově doprovázená dokončená systémová kontrola. Kresba, reference, role, hero layout i DESIGN_SYSTEM.md se nemění.

Aktuální testy a omezení: [Remediation validation](../security/REMEDIATION_1_VALIDATION.md). Glyph/confusable a neutral verdict jsou security změny, nikoli nový business flow.
