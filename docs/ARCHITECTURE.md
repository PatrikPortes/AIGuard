# Věřím? (původně AI Strážce): návrh a rozhodnutí

## Cíl a nejmenší MVP

Veřejná česká aplikace bez účtu: text nebo screenshot → vysvětlené signály → orientační riziko → bezpečné nezávislé ověření. Nikdy důkaz podvodu, pravosti ani původu obrázku. Pro soutěž je nutný screenshot, testovací dataset a skutečné uživatelské měření. PDF je další priorita; audio a video odkládáme.

První vývojový celek je textový prototyp. Deterministická pravidla jsou transparentní výchozí vrstva a testovací baseline, nikoli AI model. Před veřejným MVP přidáme serverový modelový adaptér pro text a obraz, validaci strukturovaného výstupu a vyhodnocení na odděleném datasetu. Bez modelu UI výslovně uvádí omezení. Score není pravděpodobnost ani kalibrovaná přesnost.

## Technická architektura

Node.js 24 LTS, HTTP server a jednoduchý responzivní frontend bez bundleru: minimum závislostí a rychlá reprodukce v prázdném repozitáři. Logické agenty implementujeme jako oddělené funkce v pipeline; samostatná modelová volání jen při doloženém přínosu. Rozhraní `POST /api/analyze` vrací strukturovaný JSON. Uživatelský obsah se nepoužívá jako HTML. URL se pouze rozebírají, nikdy nestahují. Model později dostane obsah v odděleném datovém poli, bez nástrojů a síťového přístupu; výstup musí projít schématem a critic kontrolou.

Pipeline: Intake (typ, limity, čeština jako výchozí kontext) → Fraud (signály s důkazy) → Content (text, později extrakce médií) → Verification (předem schválené nezávislé kroky) → Safety/Critic (limity a bezpečné doporučení). Textová pravidla v první verzi podporují češtinu; jiné jazyky nejsou ověřeny. Žádný kontakt převzatý ze vstupu nesmí být doporučen jako ověřovací kanál.

Budoucí média: podpis i MIME, maximálně 5 MB, omezení pixelů a PDF stran, zákaz SVG a aktivního obsahu, parser v izolovaném workeru s časovým limitem, bez automatického otevírání příloh a odkazů. Preferovat zpracování v paměti. Nutné dočasné soubory odstranit v `finally` a startup cleanupem. OCR není detekce deepfake; vizuální nejistota je samostatný výstup.

## Datový model

`Analysis` existuje pouze v paměti odpovědi: id (náhodný UUID), input_type, risk_score, risk_level, summary, signals[{id,title,explanation}], recommended_actions[], verification_steps[], uncertainties[], engine. Neukládat vstup, kontakty, citace ani soubory. Score 0–29 low, 30–59 caution, 60–79 high, 80–100 very_high.

Etapa měření použije SQLite na persistentním disku, později PostgreSQL při více instancích. `DailyAggregate(day, input_type, risk_level, category, engine_version, count)`; `FeedbackAggregate(day, helpful, reported_outcome, count)`; `EvaluationRun(id, dataset_version, engine_version, created_at, confusion_matrix, uncertain_count)`. Identifikátor analýzy pro jednorázový feedback držet v krátkodobé cache, ne se zdrojovým obsahem. Bez IP v DB, bez fingerprintingu. Počet testerů získat dobrovolným náhodným identifikátorem relace a vykazovat jako odhad relací, nikoli unikátních lidí. Retenci agregací a souhlas definovat před veřejným testem. Ground truth uživatelského feedbacku není ověřený fakt.

## Struktura

`src/server.js`: HTTP, validace, limity, statické soubory. `src/analysis.js`: logické agenty a pravidla. `public/`: české UI a privacy. `tests/`: jednotkové a integrační testy. `docs/`: návrh, etapy, reporty. Navazující etapy rozdělí modelový adaptér, upload worker, databázi a dataset do samostatných modulů podle potřeby.

## Bezpečnost a soukromí

Neuchovávat texty v logu ani DB. Požadavky omezené velikostí, rychlostí a timeoutem; cache limiteru musí mít limit a expiraci. Za reverse proxy nepřebírat libovolné X-Forwarded-For, konfiguraci důvěry řešit před deploymentem. CSP, zákaz embeddingu a MIME sniffingu, bez třetích stran v UI. Veřejný deployment vyžaduje HTTPS, globální limiter na proxy, sledování chyb bez payloadů a nákladové limity modelu. Vstup je nedůvěryhodný; prompt injection nemůže měnit instrukce ani volat nástroje. Neúspěch modelu musí být viditelný, ne skrytý za úspěšnou baseline odpovědí. API klíče pouze na serveru; neukládat do Git. Před zapojením modelu ověřit podmínky zpracování, retenci a přeshraniční přenosy.

Admin pouze za autentizovanou serverovou bránou, nikdy jen skrytý odkaz. Před veřejnou verzí testy rate limitu, XSS, prompt injection, poškozených a velkých médií, timeoutu extrakce a úniku dat.

## Etapa 3: AI, cena a veřejná zátěž

Závazná pipeline: validace → zachovaný levný rules engine → omezená fronta → AI worker → ověřování/safety → strukturovaná odpověď. Frontend volá pouze vlastní backend. Provider má serverové rozhraní `complete({messages, schema, model, maxOutputTokens, signal})`; cloud OpenAI-compatible adaptér může obsloužit různé cloudy i kompatibilní lokální server. Jiný protokol vyžaduje nový adaptér, ne změnu business pipeline. URL z obsahu se nestahují a klient nemůže vybrat endpoint/model/limity.

Obvyklý případ má jedno AI volání. Routing volí jednoduchý nebo komplexní model podle délky a signálů pravidel. Druhý critic call je volitelný a pouze pro vysokou nejistotu, více signálů nebo rozpor AI vs pravidla. Má vlastní rezervaci rozpočtu a je součástí stejného timeoutu. Pokud nutný critic neprojde, AI výsledek se nevydává jako ověřený. Automatická oprava JSON pomocí dalšího AI volání není povolena.

Provider vrací jen risk_score, summary, signals s doslovným důkazem ve vstupu, uncertainty a uncertainties. Server validuje schéma, velikost, počet položek, důkazy, přehnanou jistotu a kontakty; risk_level odvozuje sám. Doporučení a ověřovací kroky pocházejí pouze z bezpečných serverových šablon. Sémantickou odolnost vůči injection nelze zaručit samotným promptem: obsah je samostatné nedůvěryhodné JSON pole, model nemá nástroje, nevykonává příkazy a nevytváří použitelné kontakty. Testuje se odmítnutí nebezpečného výstupu i bezpečná konstrukce požadavku.

### Fail closed on cost

Před KAŽDÝM provider pokusem proběhne atomická trvalá rezervace počtu i maximální ceny v SQLite. Jednotkou ceny je integer microUSD (1 USD = 1 000 000 microUSD). Denní request limit, denní budget a celkový budget platí i při retry a critic voláních. Rezervace se nevracejí: timeout může být účtovaný a účetní výsledek může chybět. Konzervativní horní mez vychází z maximálního počtu input/output tokenů a operátorem ověřených sazeb pro oba modely. Input má byte limit a konzervativní tokenový odhad pro podporované textové modely; modelové ceny a kontext musí být ověřeny před zapnutím. Neznámá/neplatná konfigurace, nedostupná účetní DB, chybějící sazba/klíč nebo vyčerpaný budget = žádné nové volání.

SQLite transakce chrání více procesů na stejném hostu a stejném lokálním persistentním souboru; restart rozpočet nevymaže. Denní okno je UTC, celkový budget se přes půlnoc neobnovuje. DB ukládá pouze agregované rezervace, nikoli zprávy. Nemažte DB kvůli uvolnění budgetu. Případný skutečně vynutitelný účetní hard limit providera musí správce ověřit; soft budget alert takovým limitem není. Chybné operátorské sazby nebo další chargeable položky nelze napravit odhadem aplikace; účet vyžaduje nezávislé monitorování a kill switch.

### Queue / worker / overload

Bounded in-memory queue omezuje čekající joby i souběžné workery; job drží obsah jen do dokončení, zrušení nebo timeoutu. Plná fronta, vyčerpané limity a provider outage vrací srozumitelný dočasný stav s Retry-After, ne skrytý rules fallback. Timeout zahrnuje čekání, volání, retry a critic; odpojení klienta ruší práci. Retry výchozí 0, nejvýše 1 pro explicitní HTTP 429/503, nikdy pro timeout/neznámý stav. Každý retry znovu rezervuje cenu. Serverový per-IP a podepsaný anonymní session limiter se kombinují; cookies nejsou autentizace ani dokonalá ochrana proti botům. Volitelná bot brána je injektované serverové rozhraní, bez nakonfigurovaného verifikátoru musí režim „vyžadovat CAPTCHA“ odmítnout provoz.

Současná implementace je single-host vývojová. Rozhraní queue, worker a budget store dovolují pozdější centralizovanou frontu a horizontální workers. Multi-host režim musí být fail-closed, dokud není implementován a otestován sdílený atomický budget, globální IP/session limiter a broker (např. Redis + PostgreSQL). Samostatná SQLite na každém hostu NESMÍ být označena za globální limit. Distribuovaná fronta bude potřebovat šifrování nedůvěryhodného payloadu, krátkou TTL, žádné trvalé dead-letter payloady a zákaz automatických redelivery po nejistém provider výsledku. Horizontální provoz zatím není hotový.

AI je explicitní režim. Bez aktivace zůstává jasně označený rules režim; v AI režimu nedostupný provider vrací dočasné vyčerpání/nedostupnost, nikoli úspěšnou AI analýzu. Veřejný traffic spike je omezený limity fronty, workerů a účetní rezervací, nikoli slibem obsloužit 10 000 lidí najednou. Žádné produkční nasazení v této etapě.


## Schválená vizuální identita Věřím?

Canonical visual reference: **`docs/design/VERIM_VISUAL_REFERENCE.png`**, originální uložený styleboard; canonical character reference **`docs/design/VERIM_CHARACTER_REFERENCE.png`**. Stav originálů a schválených produkčních PNG je v [ASSETS.md](design/ASSETS.md), vizuální pravidla v [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md). Značka Věřím?, tagline „Radši ověřit než litovat.“ Věrka komunikuje s člověkem, Robo reprezentuje činnost systému. UI používá dodané produkční PNG včetně společného hero, nevytváří alternativní postavy. Reference se nevkládají do stránky a nejsou zdrojem výřezů.

## Security Gate 1 — samostatný cloud

Domácí server se ruší jako target. Nové Ubuntu24.04 VPS, Docker Compose, vlastní Cloudflare Tunnel/DNS/WAF, žádný home/Tailscale link. [Deployment plán](DEPLOYMENT_PLAN.md), [STRIDE](security/THREAT_MODEL.md), [release gate](security/SECURITY_RELEASE_GATE.md), [provoz](security/OPERATIONS.md). Public beta je blokována otevřenými P0/P1.

App i connector mají pinned minimal distroless runtime, UID65532/read-only/cap_drop ALL/NNP/CPU-RAM-PID/log/health limity. Jen loopback43127 app, žádný veřejný origin. CF client IP pouze z přesného connector socket peeru, potvrzeného edge trust boundary; veřejné forwarding headers nikdy neurčují klienta nebo origin. Produkční POST fixed Origin/Host, Fetch metadata, valid signed session; JSON/UTF8/body timeout, strict path/method/parser, global/IP/session a admission gates, SIGTERM drain. Ordered rules fráze mají stejný význam bez kvadratického restartování regexu.

AI_MODErules/no key/zero budgets vynucuje production guard. AI provider/pipeline/queue/schema/budget logika je beze změny. Screenshoty/PDF/URL fetch nejsou aktivní. Samostatné [feature/privacy gates](security/DATA_AND_FEATURE_GATES.md) vyžadují sandbox/egress/idempotency/ledger/ceny/provider review. Rezervace není absolutní garance účtu; provider soft alerts se nevydávají za skutečný hard cap.
