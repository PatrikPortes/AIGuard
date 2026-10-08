# Věřím? — report designové integrace

## Dodané změny

Značka Věřím?, tagline „Radši ověřit než litovat.“, krémové prostředí, fialovo-modrá paleta, oblé karty a jemné stíny. Skutečné responzivní komponenty: wordmark a navigace, hero s Věrčinou bublinou, formulář a příklady, Robův loading, úroveň rizika s orientačním kruhovým skóre, důvody a akce, nezávislé ověřování a privacy. Věrka je komunikační průvodkyně, Robo pouze systémový pomocník. Postavy mají označené neutrální placeholdery; nebyly generovány ani vystřiženy z reference.

Canonical visual reference je stanovena na **`docs/design/VERIM_VISUAL_REFERENCE.png`**. Originální bytes však nebyly k dispozici jako soubor ani download ID. Soubor tedy **není uložen**, nebyl vyroben náhradní obrázek. Dokončení vyžaduje originální PNG dostupné jako příloha/soubor; pak pouze bezeztrátově kopírovat a ověřit SHA-256. [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) a [ASSETS.md](ASSETS.md) tento stav výslovně uvádějí.

## Ověření

39/39 existujících serverových a AI integračních testů prošlo; skutečný OpenAI test v nich není. `npm run check` prošlo. Samostatný smoke test skutečným Chromium/Playwright ověřil desktop 1440 px, mobil 390 a 320 px, žádné vodorovné přetékání, funkční příklad → odeslání → výsledek → přepínač jednoduchého vysvětlení, viditelný Robo pouze během zpracování, privacy se správnou značkou, 0 JS chyb a 0 externích webových požadavků. Pro test byl explicitně použit rules režim. Kontrolní SHA-256 všech souborů `src/*.js` a `src/ai/*.js` před a po redesignu souhlasí.

## Otevřené assety a limity

Originální reference PNG, schválený shield/wordmark, hlavní Věrčina ilustrace a výrazy, Robo a jeho systémové stavy, případně licencovaný font a sada ikon. Textové značky a CSS nejsou prezentované jako schválené produkční ilustrace. Stav nižšího rizika negarantuje bezpečnost. Další screenshot/PDF funkcionalita nebyla tímto redesignem zahájena. AI textový adaptér stále čeká na skutečný provider test s bezpečně dodaným klíčem a cenovými/budget parametry.
