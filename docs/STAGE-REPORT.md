# Report etap 1–2 · 7. října 2026

## Implementováno

Návrh architektury, datového modelu, struktury a etap před implementací. Node.js 24 server bez externích závislostí, česká responzivní homepage a privacy, textový a URL vstup, JSON pipeline logických agentů, čtyři rizikové úrovně, vysvětlení signálů, nezávislé ověřovací kroky a přepínač jednoduchého vysvětlení. Limity velikosti a frekvence, explicitní statický allowlist, CSP a bezpečné textové vykreslení.

## Testy a výsledky

`npm ci --ignore-scripts --no-audit --no-fund` uspělo. `npm test`: 8 testů prošlo, 0 selhalo, 0 přeskočeno. Scénáře: rodinný podvod, běžná zpráva s nejistotou, injection a nepřevzetí kontaktů, URL bez návštěvy, vstupní validace, HTTP homepage/privacy/health/analýza, chybný JSON/MIME/velikost/cesta, rate limit a expirace. `npm run check` uspělo.

Samostatný `npm start` následně ověřen lokálními požadavky: health 200, homepage 200 a rodinný scénář 200 s `very_high`, engine `rules-v1`. Server běží na portu 3000. Automatické testy ověřují server a analýzu; interakce v opravdovém prohlížeči a čtečce obrazovky ještě nebyly testovány. Žádný build není potřeba, zdrojové soubory běží přímo.

Do cloudového návrhu uloženy kompletní `install_script` a `start_skill`. Uložení potvrzeno; publikace ani obnovení v nové úloze neproběhly. Pro aktivaci uživatel zkontroluje a uloží nastavení prostředí a následně prostředí publikuje.

## Známé limity

Pravidlová baseline není AI analýza, není kalibrovaná a nerozpozná všechny podvody. Veřejné soutěžní MVP ještě není hotové. Screenshot, PDF, modelový adaptér, kontextové otázky, feedback, DB/admin, 35případový dataset a měření zbývají. Kritická rizika veřejného deploymentu a budoucích médií jsou v návrhu. Privacy před veřejným testem potřebuje skutečného provozovatele a informace o hostingu/modelu. Soubory jsou lokální a dosud bez commitu či push na GitHub.

## Další etapa

Serverový modelový adaptér pro text: strukturované schéma, oddělený nedůvěryhodný obsah, timeout/nákladové limity, explicitní modelové chyby a critic. Potom screenshoty se stejným výstupem. Před skutečným modelovým testem zkontrolovat existující konfiguraci a požadovat jen chybějící přístup; klíče nikdy do chatu nebo Git.
