# Prověřit smlouvu — MVP připravené k review, nikoli k produkční aktivaci

## Základ a schválení

Izolovaný checkout `feat/contract-checker-mvp` vychází z `455f545b0a92664e265997d0807b8ced723fbb97` (připravený Web Checker 2). Původní checkout a rozpracované soubory jiných úloh nebyly změněny. Specifikace z větve `docs/contract-checker-spec`, commit `7236e11`, je zahrnuta beze změny; SHA-256 `4ff079dee82619163a866c3d34b518e9289bd799d954b2cdb6a30d0444f02df3`.

Při inventuře běžela produkce `fafccd9944d35d3955ff15a3fb5fe20e9522b20f`, image `sha256:b2f3a1c579e9df989e0349ae6ac10a35e79b7da23729c7976d97db460b36c084`. Web Checker 2 nebyl v tomto úkolu nasazen. Tato větev proto musí být reviewována společně se svým základem, před případným nasazením znovu porovnána se skutečnou produkcí. Žádné kontejnery, secrets, mounty, konfigurace ani Cloudflare nastavení nebyly změněny.

Uživatel doplnil dva konkrétní souhlasy: samostatný rozpočet smluv 0,50 USD/den a 5 USD celkem; výjimky Turnstile pouze pro stránku smluv. Schválená specifikace se tím nepřepisuje.

## Implementace

- `/proverit-smlouvu`: text, výběr typu, lokální pravidla devíti kategorií a PDF.js 6.4.299 s vlastním skutečným workerem. PDF, písma a CMaps se načítají pouze ze stejného serveru; původní soubor nikam neposíláme. Dodavatelské soubory mají manifest SHA-256 a licence.
- PDF: nejvýše 10 MB, 40 stran, 40 000 znaků, 20 sekund včetně načítání; zrušení a ukončení workeru. Skeny, šifrované a poškozené dokumenty dostávají srozumitelnou chybu. JavaScript PDF se nespouští. Strany mají lokální oddělovače pro citace.
- Bez AI provádí kontrolu prohlížeč a dokument neposílá na server. AI je ve výchozím stavu vypnutá. Zapnutí v UI vyžaduje samostatný souhlas, náhled skutečně odesílaného textu a potvrzení náhledu. Automatická anonymizace je zapnutá, doplněná ručním označením. Mapování a originál zůstávají pouze v prohlížeči; automatická anonymizace není zárukou odstranění všech osobních údajů.
- Server přijímá jen `content`, `contract_type`, `ai_consent`, `bot_token`; odmítá původní soubory, mapy a další pole. Jediný AI požadavek bez nástrojů, retry či kritika, strukturované JSON schéma. Citace musí odpovídat skutečně odeslanému textu. Originální citace se obnovují výhradně lokálně; nejednoznačné převody zůstávají anonymizované.
- Pravidlové nálezy nelze AI snížit. Výpadek, limit, neověřitelná odpověď nebo rozpoznané vložené instrukce vrací pravdivý pravidlový fallback. Nálezy používají Věrku/Roba, konkrétní první krok, otázky a slovní jistotu rozpoznání; žádné celkové skóre nebo právní potvrzení.
- Právní katalog `public/contract-legal-catalog.json` je prázdný. Právní odkazy a `possible_conflict` se bez platné schválené položky nezobrazují. Kontrola katalogu: `node scripts/contract-catalog-check.mjs`.
- Rozpočet má samostatné tabulky ve stávající budget SQLite, návštěvnické rezervace oddělený soubor. Limity 2/24 h, 20/den, 0,50 USD/den, 5 USD celkem; doplňkový síťový limit, omezená fronta, timeouty, stávající HTTP/session/origin ochrany. Rozpočet rezervuje konzervativní horní mez, včetně nezdařených volání; automatický restart limit nevynuluje.
- Privátní relay přidává dvě pevné interní cesty pro smlouvy a Siteverify; zachovává samostatný dosavadní profil zpráv. Nelze zadat libovolné externí URL. Server ověřuje úspěch, hostname a action Turnstile; produkční testovací bot klíče odmítá.
- CSP na `/proverit-smlouvu` přidává pouze `worker-src 'self'` a `https://challenges.cloudflare.com` do script/connect/frame. SDK se načítá až po souhlasu a potvrzení náhledu. Nepřidává se inline script, unsafe-eval, blob ani změny ostatních stránek. Turnstile je třetí strana uvedená u souhlasu a v soukromí.
- Homepage, sitemap a privacy obsahují novou funkci. Stávající message/web/loan logika, SEO, provozní konfigurace, dashboard a anonymní statistiky zůstávají zachovány; smlouvy zatím nezvyšují čítač kontrol zpráv.

## Cílené ověření

30 nových testů (původně 29, doplněna revalidace PDF assetu). Kontrola citací/normalizace a offsetů, anonymizace, consent gate, nulový přenos dokumentu bez AI, oddělené finance a kvóty, restart, timeouty, schema, prázdný katalog, bot gate, relay a scoped CSP. Testy poskytovatele používají falešnou odpověď; skutečné OpenAI ani bot credentials nebyly použity.

40 syntetických anotovaných smluv pro pravidla: precision 1,00 u čtyř prioritních kategorií; recall 0,857 pro pokuty, prodlužování a rozhodčí doložky, 1,00 pro výpovědní lhůty. 5 dokumentů bez nálezů, 10 dokumentů s vloženými instrukcemi, 40 000 znaků pod 20 ms CPU v cíleném testu. Nejde o nezávisle anotovaný právnický korpus ani o evaluaci živého AI modelu.

V prohlížeči: textové PDF a PDF obsahující JavaScript (pouze text), pět skenů, šifrovaný soubor, 41 stran a poškozený soubor; správný lokální výsledek nebo odmítnutí. Formulář a výsledek bez vodorovného přetékání na 320, 360, 375, 393, 430 px; desktop 1280 px. Vstupy 18 px, hlavní ovládací plochy nejméně 44 px. Není ověřeno na fyzickém iPhonu/Safari ani na každém PDF se složitým vícesloupcovým rozvržením.

Vybraných 47 regresních testů: 41 prošlo, šest selhání reprodukováno na nezměněném základu 455f545. Pět starších HTTP consent testů očekává 400 místo existujícího pravidlového fallbacku 200. Jeden budget test používá UTC půlnoc, zatímco denní budget běží podle Europe/Prague. Testy/práhy nebyly oslabeny ani opravovány v této větvi. Jediná aktualizace existujícího testu je očekávaný počet homepage panelů „Již brzy“ (2 → 1).

**Build gate není zelená:** standardní Dockerfile spouští celou historickou sadu a tato známá selhání jej blokují. Produkční image nebyl sestaven ani nasazen. Není přidán způsob přeskočení bezpečnostních testů. PR má zůstat draft do vypořádání příslušných bran.

## Náklady a zbývající brány

Konfigurace používá jako kandidáta existující snapshot gpt-4.1-mini-2025-04-14: 0,40 USD/milion vstupních a 1,60 USD/milion výstupních tokenů podle [OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Ilustračních 15 000 vstupních + 4 000 výstupních tokenů stojí přibližně 0,0124 USD. Skutečná cena závisí na tokenizaci; zatím nebyla změřena na živém modelu. Konzervativní rezervace může vyčerpat rozpočet dříve než globálních 20 kontrol. Celkový limit 5 USD se neobnovuje denně.

Před produkční aktivací:

1. Review implementace a původního Web Checker základu; vypořádat existující červenou build gate bez snížení bezpečnostních kritérií.
2. Ověřit kvalitu kandidátního AI modelu na schváleném anotovaném korpusu, skutečné tokeny/latenci a serverovou Siteverify integraci. Mock testy tento krok nenahrazují.
3. V Cloudflare vytvořit Managed Turnstile widget pro přesný hostname `verimtomu.fyi`. Site key do `CONTRACT_TURNSTILE_SITE_KEY`, secret bezpečně do `CONTRACT_TURNSTILE_SECRET`; nic do Gitu. Backend očekává `action=contract-check`, nepoužívá klientskou IP při Siteverify. [Cloudflare testovací klíče](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) patří pouze do izolovaných testů.
4. Posoudit uživatelské formulace, soukromí a případné katalogové položky. Prázdný katalog je podporovaný; jeho naplnění není podmínkou místního MVP.
5. Podle `deploy/env/contract.env.example` doplnit pouze nové proměnné, model také do privátní proxy. Zachovat dosavadní síť, secrets, mounty a konfiguraci. Teprve po splnění bran a novém schválení nasazení nastavit `AI_CONTRACT_ENABLED=true`. Nezvyšovat povolené limity.

Koncipient nemá žádné propojení s touto implementací.

## Doplnění: závazný PDF security invariant

PDF je nedůvěryhodný vstup. Používáme výhradně textové API PDF.js v místním browser workeru, žádný viewer, render, scripting manager, annotation/form layer, navigaci ani čtení/spouštění příloh. Původní soubor se neposílá, neloguje, neukládá ani necachuje aplikací. File input se vyprázdní ihned po převzetí souboru. Cache pevně verzované knihovny PDF.js není cache nahraného PDF.

Worker má navíc vlastní response CSP `connect-src 'none'`, `default-src 'none'`, `worker-src 'none'`; jeho skript je pouze same-origin. Nezískává výjimky pro Turnstile. `worker-src 'self'` zůstává jen na HTML `/proverit-smlouvu`. Pomocné soubory mohou přijít jen z pevného seznamu místních fontů/CMap; traversal, URL, neznámé soubory a WASM jsou odmítnuty před fetch. Fetch má `credentials:omit`, zakázané redirecty a kontrolu délky, server nadále ověřuje SHA-256. Obsah dokumentu nemůže zadat jiný síťový cíl.

Šifrování se odmítá nejen při požadavku na heslo, ale i z `EncryptFilterName` po načtení; tím je pokryté PDF s prázdným uživatelským heslem. Timeout a zrušení ukončí worker, parser i probíhající pomocné fetch požadavky; chyby parseru se zobrazují bez diagnostických detailů. Limity 10 MB, 40 stran, 40 000 znaků a 20 sekund se nemění.

Doplněno pět cílených bezpečnostních testů včetně okamžitého zrušení a timeoutu zaseknutého čtení, assertion CSP workeru a syntetické PDF šifrované prázdným heslem. Kontrola v prohlížeči potvrdila textovou extrakci, ignorování PDF JavaScriptu, odmítnutí obou variant šifrování, srozumitelnou chybu parseru a prázdný file input. Tato aktualizace nemění produkci ani neobchází původní build gate.

## Oprava při přípravě nezávislého review

Citace začínající/končící uvnitř anonymizační značky se podle specifikace nadále zobrazuje anonymizovaná. Její offsety ale patří odeslanému textu, nikoli originálu. Původní spojování je mohlo chybně použít jako potvrzení překrývajícího se pravidlového nálezu v originálu. Browser nyní takový nález označí `unmapped`; spojování ho neslučuje podle offsetů s originálem. Nález zůstává viditelný jako samostatné doplnění AI a lze deduplikovat pouze stejnou anonymizovanou citaci. Toto lokální označení se neodesílá na server.

Nový cílený test nejprve reprodukoval chybný `rules+ai` a po opravě potvrzuje zachování `rules` u původního nálezu a viditelné anonymizované AI citace. Po opravě prošlo 23 testů core/pipeline včetně nového testu. Před ní prošlo všech 35 cílených testů aktuálního PR; sada má nově 36 testů. Produkce zůstává beze změny.

## Doplnění: opravy po nezávislém review (release rules-only)

- **PDF.js v Gitu.** Obecné pravidlo `build/` v `.gitignore` vyřadilo `public/vendor/pdfjs/legacy/build/pdf.mjs` a `pdf.worker.mjs`; čistý checkout vracel 503 a PDF nefungovalo. Adresář je nyní výslovně zahrnut, soubory odpovídají `pdfjs-dist@6.4.299` (npm integrity i SHA-256 v `manifest.json`) a `.gitattributes` drží jejich přesné bajty.
- **Volba AI jen při nakonfigurované AI.** Souhlas a náhled pro AI jsou ve výchozím stavu skryté a zobrazí se jen při `configured:true` z `/api/contract-status`; souhlas se jinak neuplatní.
- **CSP.** `/proverit-smlouvu` má vždy jen `worker-src 'self'` navíc; originy Turnstile se přidávají pouze při plně nakonfigurovaném AI runtime. Ostatní trasy beze změny.
- **CPU brána 20 ms** měří čas hlavního vlákna (`process.threadCpuUsage`, kritérium CR03) po zahřátí a vyžaduje všech pět měření pod nezměněnými 20 ms; pravidla alokují méně, výstup je beze změny (korpus + 4 000 fuzz dokumentů).
- **Docker validace** kopíruje `ai-proxy.cjs` jen do validační fáze, aby test relay běžel i v obrazu; do produkční fáze se nedostane.

### E1 — build brána

Simulace přesné Docker brány (`AI_MODE=rules node --test --test-concurrency=1`, `claude-review-check`, `npm run check`) dává na základu `455f545` i na této větvi **identickou sadu 20 selhání** a selhání `claude-review-check` (CR-08). Tato větev žádnou novou regresi nepřidává. Selhání pocházejí ze změn produkce (`e94af36 Recover production sources from 2026-10-12` a navazujících), u nichž nebyly aktualizovány bezpečnostní testy a reference. Jejich oprava vyžaduje rozhodnutí vlastníka o bezpečnostních kritériích (souhlas, immutable CR03 reference, schválené assety, M9), proto není součástí tohoto release a produkční build zůstává blokován.

### E1 — vyřešeno (schváleno vlastníkem 2026-10-13)

- `2606db4` údržba brány: souhlas ověřuje invariant „bez `ai_consent === true` 0 volání poskytovatele, 0 odeslání, 0 rezervací rozpočtu, 0 jobů fronty“ (rules-only 200 je povolena); CR03 reference s novým textem a zrcadlenou politikou akcí (detekce beze změny); explicitní manifest 17 assetů s limity; rozpočet podle půlnoci Europe/Prague; `admin/src/usage.js` jen ve validační fázi Dockeru; CR-08 na všech stránkách; M9 HTML s povoleným logem ze stejné domény. Žádný test nebyl odstraněn ani přeskočen, žádný limit snížen.
- `fa89c62` výsledek s provedenou AI už netvrdí „nikoli AI model“.
- `de72f40` odeslání formuláře smlouvy je bez JavaScriptu zakázané (CR-08).
- `47a67af` `/uz-se-to-stalo` bez výjimky pro Cloudflare beacon: `script-src 'self'`, žádné zdroje třetích stran; nefunkční odkaz `#how-it-works` odstraněn. `/` a `/privacy` beze změny.

Brána odpovídající Dockerfile (`node --test`, `claude-review-check`, `npm run check`) prochází z čistého checkoutu.
