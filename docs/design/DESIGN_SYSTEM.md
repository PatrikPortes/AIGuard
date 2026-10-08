# Věřím? — design systém

## Dvě canonical references

1. **`docs/design/VERIM_VISUAL_REFERENCE.png`** — schválený originální styleboard pro layout, UI, barvy a celkový vizuální styl.
2. **`docs/design/VERIM_CHARACTER_REFERENCE.png`** — schválený originální character sheet pro vzhled, role, proporce a stavy Věrky a Roba.

Oba originální PNG jsou uložené v repozitáři beze změny; velikosti a SHA-256 jsou v [ASSETS.md](ASSETS.md). Při drobném rozporu má **character sheet prioritu pro vzhled postav** a **visual reference prioritu pro layout/UI**. Reference nesmějí být upravovány, překreslovány, převzorkovány ani komprimovány.

Styleboard není obrázek webu určený k vložení do stránky. Character sheet **není sprite sheet**. Z žádné reference se nesmějí vystřihovat produkční postavy nebo jiné assety. Produkční ilustrace musí být dodány jako samostatné schválené soubory, nikoli odvozeny výřezem či novým generováním.

## Identita a tón

Značka **Věřím?**, tagline **Radši ověřit než litovat.** Přátelské cartoon prostředí, krémové plochy, fialovo-modrá identita a čisté strukturované výsledky. Přehlednost má přednost před dekoracemi. Komunikace česky, krátké věty, bez žargonu; tykání v uvítání, jasné a zdvořilé instrukce ve formuláři a výsledcích. Nevyvolávat paniku ani falešný pocit bezpečí.

Věrka je hlavní digitální průvodkyně: uvítání, vysvětlení, doplňující otázky, upozornění a další kroky. Robo je sekundární pomocník reprezentující práci systému: zpracování, kontrola a načítání. Robo nevede uživatelský rozhovor. Věrka není reálná osoba ani tvrzení, že zprávu posoudil člověk. Animovaný postup nesmí předstírat hotové operace.

## Barvy

Paleta přepisuje čitelné hex hodnoty ze styleboardu. Krém, povrchy a tmavší dostupné varianty jsou odvozené implementační tokeny, ne vydávané za přesný pixelový odběr. Skutečné produkční assety mohou mít vlastní barevné profily; reference se kvůli tomu nemění.

| Token | Hodnota | Použití |
|---|---|---|
| `--brand` | `#6C63FF` | Primární identita, dekorace, otázník značky |
| `--brand-action` | `#5146D8` | Odvozená tmavší fialová pro bílé texty tlačítek a focus |
| `--ink` | `#0F1B3D` | Hlavní tmavomodrý text |
| `--accent` | `#38BDF8` | Modré akcenty Roba a dekorace |
| `--success` | `#22C55E` | Barevný signál nižšího rizika |
| `--risk` | `#EF4444` | Vysoké riziko, nikoli běžná chyba formuláře bez vysvětlení |
| `--attention` | `#F59E0B` | Nejistota / zvýšená opatrnost |
| `--cool-background` | `#F8FAFF` | Chladnější alternativní pozadí ze styleboardu |
| `--muted-reference` | `#64748B` | Referenční sekundární text; finální UI používá tmavší variantu |
| `--cream` | `#FFFCF5` | Odvozené hlavní krémové prostředí |
| `--surface` | `#FFFFFF` | Karty a chatové bubliny |
| `--brand-soft` | `#F0EEFF` | Jemná fialová výplň |
| `--blue-soft` | `#EEF8FF` | Robo a systémové stavy |
| `--mint-soft` | `#ECFAF3` | Ověřovací kroky a nižší riziko |
| `--amber-soft` | `#FFF5DE` | Zvýšená opatrnost |
| `--risk-soft` | `#FFF0EF` | Rizikový výsledek |
| `--muted` | `#526078` | Dostupný sekundární text |

Barva nesmí sama nést význam. Každý stav má textový název a případně ikonu. Výrazná zelená neznamená „je bezpečné“. Nižší riziko stále obsahuje nejistotu a nezávislé ověření. Skóre nikdy není procentem pravděpodobnosti.

## Typografie, prostor a tvary

Bez dodaného licencovaného fontu používáme systémový sans-serif, prioritně `ui-rounded`, potom běžné systémové fonty. Přátelský výraz vzniká tvary a tónem; nezavádíme externí fontový tracking. Po dodání lze použít odsouhlasený font s českými znaky a WOFF2 licencí. Nadpisy tučné, velké, tmavomodré; dlouhé texty běžné čitelné, ne rukopisné. Rukopisný akcent ze styleboardu je doplňková možnost až s řádným assetem/fontem.

Odvozené scale: spacing 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px; radius 12 px pro ovládání, 20 px pro bubliny, 28 px pro velké karty, pill pro štítky; jemný stín `0 12px 36px rgb(35 27 93 / 7%)`. Max šířka stránky 1120 px, obsah výsledku čitelný na desktopu i mobilu. Text min. 16 px, line-height 1.6. Interaktivní prvky min. 48 px vysoké. Focus je viditelný fialový obrys; reduced-motion vypíná dekorativní pohyb.

## Komponenty a chování

- Textový wordmark Věřím? + tagline, zatím bez náhrady schváleného shield loga.
- Uvítací bublina Věrky vedle formuláře používá schválený produkční `verka-welcome.png`; nevytváří se nový avatar.
- Karta vstupu s jasnou hlavní akcí, příklady a informací o soukromí. Text a URL jsou funkční. Screenshot/PDF jsou jen označené budoucí vstupy, ne falešné ovládání.
- Robo v samostatném systémovém bloku pouze během skutečně běžícího požadavku. Žádné simulované odškrtávání jednotlivých analýz.
- Výsledek: textová úroveň + kruhové orientační skóre, souhrn Věrky, důvody, konkrétní kroky a nezávislé ověření. Na mobilu jeden sloupec; na desktopu důvody a kroky vedle sebe. Nejistota a podrobnosti dostupné bez registrace.
- Režim jednoduchého vysvětlení zůstává funkční. Error/overload se česky zobrazí v existujícím alertu, bez ukrývání neúspěchu za úspěšnou analýzou.
- Privacy používá stejné tokeny a wordmark. Bez třetích stran, obrázkového styleboardu na stránce, externích fontů a nového ukládání obsahu.

## Kanonické postavy a role

Vzhled určuje `docs/design/VERIM_CHARACTER_REFERENCE.png`. Každá produkční varianta musí zachovat stejný výtvarný styl, proporce, obličej, barvy a znak štítu Věřím?. Samostatné assety a jejich stav jsou v [ASSETS.md](ASSETS.md).

### Věrka — HUMAN-FACING GUIDE

Hlavní digitální průvodkyně: mladá přátelská kreslená postava, hnědé vlasy v charakteristickém vysokém drdolu, velké hnědé oči, fialovo-modrá mikina se znakem štítu Věřím?, klidný a důvěryhodný výraz. Komunikuje s uživatelem: vítá, ptá se, vysvětluje, upozorňuje, doporučuje další postup a provází výsledky a pozitivním feedbackem.

| Stav | Použití |
|---|---|
| `default` | Výchozí přítomnost průvodkyně |
| `welcome` | Přivítání a první krok |
| `thinking` | Chybějící kontext, přemýšlení nad vysvětlením |
| `question` | Doplňující otázka uživateli |
| `explaining` | Vysvětlení signálů, výsledku a doporučení |
| `warning` | Srozumitelné upozornění na riziko |
| `success` | Dokončení bezpečného kroku nebo pozitivní feedback, nikoli potvrzení pravosti zprávy |
| `thumbsup` | Povzbuzení a pozitivní feedback |

### Robo — SYSTEM / ANALYSIS ASSISTANT

Sekundární technický pomocník: malý bílý robot, tmavý obličej/displej, modré a cyan prvky, znak štítu Věřím?, přátelský vzhled a konzistentní proporce. Reprezentuje práci systému: loading, analýzu, hledání, technický progress, systémové informace, kapacitu a technické chyby. **Nesmí nahradit Věrku jako hlavní komunikační postavu.**

| Stav | Použití |
|---|---|
| `default` | Výchozí systémový pomocník |
| `analyzing` | Skutečně běžící analýza / loading |
| `searching` | Skutečně běžící hledání nebo kontrola; neimplikuje otevírání podezřelých URL |
| `warning` | Systémové upozornění nebo omezení |
| `success` | Úspěšně dokončená operace, nikoli záruka bezpečnosti obsahu |
| `tip` | Doplňková systémová informace |
| `capacity` | Dostupná nebo vyčerpaná kapacita systému / rozpočtu |
| `error` | Technické selhání |

### Produkční soubory a placeholdery

Produkční assety patří do `public/assets/characters/verka/` a `public/assets/characters/robo/`, preferovaně jako transparentní WebP nebo PNG podle výsledné kvality a velikosti. Seznam všech 16 požadovaných stavů je v ASSETS.md. Dodaná sada z `Archiv.zip` obsahuje 13 schválených canonical production PNG, které jsou uložené a technicky napojené do odpovídajících existujících komponent. Tři Věrčiny stavy `default`, `question`, `thumbsup` zatím chybí. Dodané PNG jsou zachované beze změny; character sheet se nepoužívá jako runtime obrázek.

Nevytvářet vlastní alternativní podobu Věrky nebo Roba, negenerovat nové varianty a nevystřihovat z character sheetu. CSS, emoji ani externí ikony nesmějí nahrazovat produkční postavy. Pro dodané stavy používat výhradně schválené produkční soubory. Pokud konkrétní asset chybí, zachovat **současný označený placeholder**; není schválenou ilustrací ani novým návrhem postavy. Volitelné detaily výrazů a zadní pohled ze sheetu nejsou součástí povinných 16 assetů a rovněž vyžadují samostatné schválené exporty.

## Technická hranice redesignu

Redesign mění pouze `public/` a dokumentaci. Scoring, provider, queue, rozpočet, rate limit, prompt, schema a safety layer zůstávají beze změny. Zachovává se API, vstupní limity, consent a režimy rules/AI. Testy AI nejsou nahrazeny designovými testy. Ani jedna canonical reference není runtime asset. Aktuální napojení produkčních postav mění pouze existující frontendové komponenty a dokumentaci. Po výslovném souhlasu uživatele je povolena jediná serverová výjimka: 13 konkrétních obrázků v existujícím statickém allowlistu. Backendová business logika, API, AI pipeline, limity a bezpečnostní hlavičky zůstávají beze změny. Externí AI se nezapíná.
