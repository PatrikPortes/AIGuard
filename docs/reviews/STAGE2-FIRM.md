# Stage 2 – Prověřit firmu

Základ: c5e8ea2f87aa7225b86d025d34c4d3fb3e071c8c. Větev feat/firm-stage2-2026-10-14.

## Implementace

- Nové pevné routy ares-profile a dph v existujícím ai-proxy.cjs. Žádná nová služba, URL od klienta, změna egressu nebo deploymentu. Původní ARES route a AI handlers zachovány.
- DPH používá schválenou adresu /dpr/, jedno osmimístné firemní DIČ, SOAPAction prázdný; 3,5 s, 64 kB streamový limit, souběh 2, 10/min, 500/h, 4000/24 h. Odstávka → 503 a neověřený zdroj.
- ARES základ/VR/RES s validací totožnosti IČO, checksumem, streamovými limity 128/512/64 kB, společným deadline 3,5 s a 20 profilů/min. Základ je potřeba znát před VR, aby se VR nevolal pro OSVČ; VR a RES pak běží paralelně v původním deadline.
- Minimalizace před opuštěním relay a druhý whitelist v aplikaci. Žádná data narození, rodná čísla, soukromé adresy, historická jména nebo volné insolvenční texty. OSVČ pouze obec a bez osobního DIČ; nevolá se VR ani DPH.
- Klient jen přes interní relay s celkovým 4s rozpočtem; omezená cache 100 subjektů/10 min, deduplikace souběžného stejného IČO. Cache pouze vybraných veřejných údajů, bez persistence. Částečné údaje zůstávají označené nedostupností i v cache.
- /api/firm přijímá pouze {ico}, má Origin/session/IP ochrany, vlastní gate(2), session 10/min a globální 20/min. Duplicitní a neznámé JSON klíče jsou odmítnuty před registrem. Volitelná přesná wire-validace v readJson se používá pouze pro tuto route.
- Deterministická pravidla F-NF, F01–F07, F09–F12, F14, F15. F07 má přednost před F06; historický zápis nezpůsobí F03; kapitál/neplátce pouze info. F08, F13, F16 neimplementujeme podle aktuálního Stage 2 výřezu.
- fromFirm používá L1–L5 a existující renderer. Povinné ARES/RES/insolvenční informace v ARES, případně VR a DPH podle použitelnosti; nedostupnost nikdy není zelená. Červený potvrzený nález má přednost před vedlejším výpadkem.
- Stránka podle IČO, aktivní homepage karta, sitemap, informační privacy text, serverová allowlista nových assetů. style.css/app.js ani checkery nezměněny.
- Jediná oprava Stage 1 filtru: negativní oficiální status „Nespolehlivý plátce DPH“ není pozitivní zakázané tvrzení „Spolehlivý plátce“. Ostatní ochrany beze změny.

## Ověření

109/109 relevantních Node testů PASS. Strict security gate 16/16 PASS (původní TODO značky zachované), npm run check PASS. 20 browser scénářů skutečné stránky (5 výsledků × 320/375/390/430 px) prošlo v in-app browseru. Primární akce nejvýše 408,625 px od vrchu viewportu, fokus na verdiktu, žádný overflow, všechny viditelné cíle nejméně 48 px. Vložení HTML do názvu nepřidalo aktivní element. Neplatné IČO bylo odmítnuto v prohlížeči.

Browser síť byla prověřena místním serverovým záznamem požadavků, same-origin CSP a DOM assety; samostatný Playwright síťový spy skript je připraven, ale samostatný launcher se v tomto běhu nepoužil. Žádné živé registry ani produkční VPS nebyly při testech kontaktovány.

## Omezení a kroky před releasem

- MVP jen IČO: bez vyhledání názvu, porovnání účtu, AI, doménového kontextu, přímého ISIR, ČNB a datové Sbírky listin. Nepárujeme doménu s firmou.
- ARES je agregace se zpožděním; údaje nejsou úřední listinou. Právní formy a zaměstnanci mají malý pevný číselník; neznámý kód oboru je pouze kód, bez vymyšleného názvu.
- Celkový 4s rozpočet může při pomalém ARES ponechat DPH nedostupné; výsledek to transparentně ukáže.
- Po schválení samostatně push/review/merge. Release musí stavět web i relay ze stejného SHA existujícím runbookem a zachovat rollback.
- Před produkčním nasazením ověřit skutečný egress relay na dokumentovaný DPH /dpr/ endpoint a přetrvávající blokaci přímého web egressu (D1). To zde neprovádíme.
- Dokončená Stage 0 je předkem této větve. Cizí F5a worktree ani jeho změny jsme neupravovali.

## Čistý Git archive a širší sada

Kompletní automatický discovery běh z čistého Git archivu: 309 testů, 298 PASS, 11 FAIL. Všech 11 stejných selhání bylo reprodukováno i na výchozím Stage 1 c5e8ea2 cíleným spuštěním pouze dotčených tří skupin: admin/tests/dashboard.test.js (nenainstalované jose), tests/deploy-scripts.test.js (8 selhání, chybějící linuxový flock) a tests/ingress.test.js (2 selhání, EADDRNOTAVAIL 127.0.0.2 na Macu). Nejde o novou regresi. Prahy a testy jsme nezměnili.

Z čistého archivu strict gate 16/16 PASS a npm run check PASS. Nové fixture soubory jsou všechny v Gitu i jmenovitě v .dockerignore pro validační build; nic se nebere ze starého prototypu nebo /tmp závislostí. Skutečný Docker build nebyl spuštěn. Standardní linuxový release/build gate je proto stále nutný před produkčním nasazením; širší sadu neoznačujeme za plně zelenou.

Místní browser wire záznam: 22 kontrolních POSTů (20 scénářů + samostatné ověření a screenshot) mělo pouze klíč ico na /api/firm. Neplatné IČO 27082441 neodešlo. 20 automatických mobilních kontrol PASS; žádné konzolové chyby.
