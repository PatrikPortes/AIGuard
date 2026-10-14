# Stage 1 — nezávislý základ Verdict UX

Základ: e05aa76f212b04894b6f87418673f28b24dd3247 (Stage 0). Větev feat/verdict-foundation-2026-10-14.

Obě kompletní specifikace načteny z GitHub commitu 94433384e899bafca67077328cca8f051b9a76c4. Přiložené soubory docs/specs jsou bajtově shodné s jeho Git blobs: SPEC_STAGE1_STAGE2.md = 03155e66364041e03a97d243d9f1f0ffc3c18efb; SPEC_PROVERIT_FIRMU.md = 7b0c2a461944943ad2b72d77571cf886b41295fc. Přednost pro tento úkol má konkrétní Stage 1 plán S1.1–S1.3; nic ze Stage 2 se neimplementuje.

## Hotovo

- CheckResult schema 1, katalog úrovní a pravidel; čisté deriveLevel L1–L5 v pořadí dle specifikace. Primární nedostupnost vede k incomplete, další povinné zdroje k attention. Chybějící zdroj se považuje za unavailable. Povinné not_applicable není náhrada provedené kontroly: je nutné odstranit takový zdroj z required až podle skutečné policy.
- Registry fakta vyžadují zdroj a datum. Registry nález navíc odkazuje na registry fakta. AI nález je nejvýše attention. Šablony nevytvářejí tvrzení o pravosti/bezpečnosti, úspěšnou neprovedenou kontrolu ani právní závěry. risk_score se nikam nekopíruje.
- Samostatné adaptéry fromMessage/fromLoan/fromWeb/fromContract, bez mutace původního objektu a bez DOM/sítě. Žádná migrace existujících stránek.
- Fixed-copy katalog původních signálů, všech 12 aktuálních AI observation druhů a doporučení z baseline 5c91de2. Pořadí stávajících doporučení zůstává stejné (primární + max 3 deduplikované sekundární). Nepodporované doporučení je odmítnuto, použije se bezpečný výchozí postup.
- Smíšený API risk_level může zahrnovat zvýšení od AI. Adaptér proto zachovává původní pravidlové minimum z pevné contribution metadata baseline 5c91de2; AI ani risk_score nejsou do tohoto minima zahrnuty. Jde jen o projekci již nalezených signálů, nikoli nové prohledávání obsahu. Volitelně lze dodat důvěryhodný původní rulesBaseline. Nové či neznámé ruleId se neodhadují, výsledek zůstane neúplný/attention. Při změně detektoru musí navazující integrace aktualizovat revidovaný katalog a jeho testy.
- Smlouva maximálně attention; citace je user_input, nikoli ověřené registry faktum. Výpočty půjčky mají kind calculated a výslovný původ ze zadaných údajů; RPSN/procenta se do tohoto modelu nepřenášejí, původní kalkulačka se nemění.
- Jedna nová komponenta verdict-view.js, samostatné verdict.css, textContent, nativní details/summary, přesun fokusu, status, označené AI, samostatné unknowns, sources a oficiální odkazy bez referreru. Výsledek none_found má vždy povinné omezení bezpečnosti.
- AI summary je zatím pouze pevná neutrální šablona: volitelný volný text modelu nepřebíráme, aby nemohl dodat nepodložený fakt. Důvody a doporučení jsou deterministické.

## Testy

- 19 nových jednotkových/statických testů. Generovaná tabulka 384 kombinací L1–L5; 1000 seedovaných scénářů povinné nedostupnosti; AI nesníží existující pravidlové riziko, ani sama nevytvoří serious; provenance a zakázané formulace; všechny aktuální AI observation ID; whitelist faktů a odkazy; barvy >=4,5:1 ověřené přes existující scripts/contrast-check.js.
- 76 relevantních Node testů celkem PASS, 0 FAIL: nový základ a zachované zprávy/odesílatel, půjčky, smlouvy, web/ČOI, static JSON, release/Stage 0. Nejde o opakování celého historického Linux/Docker auditu.
- Skutečná komponenta ověřena přes automatizovaný in-app browser: 7 scénářů × šířky 320/375/390/430 px = 28 PASS. Primární akce nejníže 354 px (<568); bez horizontálního overflow; všechny viditelné odkazy/summary >=48px; fokus na headline; AI sekce pouze performed; žádné DOM onerror elementy z vložené citace. Žádná chyba konzole. Měřené výsledky outputs/verdict-foundation-mobile.json a screenshot outputs/verdict-foundation-mobile.png.
- scripts/verdict-browser.js obsahuje reprodukovatelný Playwright test a dočasný místní fixture server. Nejde o novou produkční službu, route ani změnu CSP veřejné aplikace. Tento běh použil dostupný in-app browser, nikoli samostatný Chrome launcher.
- Syntax kontroly a git diff --check PASS.

## Co zbývá k integraci

1. S1.4: po integraci Stage 0 přidat nové statické assety do allowlisty serveru; veřejná CSP musí zůstat stejná. Zde src/server.js ani tests/web-release.test.js neměníme.
2. fromFirm a jeho mapování vzniknou se Stage 2 podle aktuální specifikace. Starší samostatný prototyp Firmy se do tohoto základu nepřenáší.
3. Napojovat stránky po jedné: Firma → Web → Smlouva → Půjčka → Zpráva. Zpráva/Půjčka až po integraci F5a. Je nutné měřit skutečný integrovaný layout, ne pouze fixture.
4. U legacy neznámých signálů zachovat fail-closed; pokud bude potřeba nový údaj o rules baseline, nejprve ověřit zdroj z existujícího checkeru, ne přijímat tvrzení AI.
5. Připravený základ je pro review, nikoli nasazená funkce. Žádný push, merge, deployment, relay, síť, API, právní katalog nebo produkční konfigurace se neměnily. Původní Stage 0 a F5a worktrees nebyly upravovány.
