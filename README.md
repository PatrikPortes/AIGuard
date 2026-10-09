# Věřím?

Radši ověřit než litovat.

## Připravený public beta deployment

[Deployment plán](docs/DEPLOYMENT_PLAN.md) odpovídá ověřenému domácímu serveru Linux Mint 22.2 / Ubuntu Noble a samostatnému Docker Compose projektu. [Compose template](deploy/compose.yaml), Dockerfile a release/rollback skripty jsou příprava, nikoli provedené nasazení. Produkční image je zatím uzamčený na rules-only, nulové AI budgety a důvěryhodný Cloudflare ingress. Lokální vývoj nadále používá socket IP. Skutečný tunnel, DNS a údaje pro public beta zůstávají předmětem schválení.

Česká aplikace ve vývoji podle [architektury](docs/ARCHITECTURE.md) a [etap](docs/STAGES.md). Etapy 1–2 jsou pravidlový textový prototyp; etapa 3 přidává **serverový AI adaptér a hybridní textovou pipeline**. Skutečný provider test je podmíněný vaším přístupem k OpenAI. Screenshoty ani PDF zatím nejsou implementované a počkají na ověřenou textovou AI.

## Lokální vývoj

Node.js 24 LTS, bez externích balíčků. SQLite používá nativní `node:sqlite`.

```sh
cd /workspace/AIGuard
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
npm run dev
```

Bez konfigurace běží explicitní **rules** režim. Žádný mock se nepoužívá v runtime. `npm start` a `npm run dev` zapínají Node `--use-env-proxy`, aby respektovaly platformní HTTPS proxy a její autentizaci. Výchozí host 127.0.0.1, port 3000. `.env.example` je pouze dokumentace; `.env` se automaticky nenačítá. Lokální soubor můžete načíst příkazem `node --use-env-proxy --env-file=.env src/server.js`; klíče nikdy necommitujte. V cloudu použijte zabezpečené nastavení prostředí, ne chat.

## Budoucí AI ve vývojovém prostředí

Veřejný cloudový release nyní výhradně **AI_MODE=rules**, bez AI secrets a s nulovými budgety. Production guard aktivaci AI blokuje; následující vývojové instrukce nejsou schválení produkční AI. Samostatný [AI release gate](docs/security/DATA_AND_FEATURE_GATES.md).

Nastavte `AI_MODE=ai`, secret `GUARD_LLM_API_KEY`, `AI_MODEL_SIMPLE` a případně `AI_MODEL_COMPLEX`. Výchozí serverový endpoint je `https://api.openai.com/v1/chat/completions`. Příklad modelu `gpt-4o-mini` musí být dostupný na vašem účtu a podporovat strict JSON schema a max_completion_tokens; jeho dostupnost zatím nebyla ověřena skutečným voláním. Pro jiný protokol implementujte serverové `complete` rozhraní, pro OpenAI-compatible server změňte endpoint/model. HTTP je povolen pouze s `AI_ALLOW_LOCAL=true` na loopbacku; cloud vždy HTTPS, bez přesměrování.

**Povinné cenové nastavení:** `AI_INPUT_USD_PER_MILLION` a `AI_OUTPUT_USD_PER_MILLION` musí být aktuální horní meze sazeb přes oba modely. Ceny se nehádají ani nepřebírají z modelové odpovědi. Nastavte kladné `AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_BUDGET_MICRO_USD`, `AI_TOTAL_BUDGET_MICRO_USD`. 1 USD = 1 000 000 microUSD. Nulové výchozí budgety zakazují všechny AI pokusy. Pro bezpečný první test lze povolit 1 pokus, denní a celkovou rezervaci nejvýše 1 USD, vypnutý critic a retries 0. Cena závisí na vámi ověřených sazbách. Vyšší než povolená rezervace se odmítne, nikoli odešle.

`AI_BUDGET_DB` musí být trvalý lokální soubor (výchozí `data/ai-budget.sqlite`). Všechny procesy na stejném hostu musí používat **stejný** soubor. Nemažte jej kvůli restartu nebo uvolnění kapacity. Rezervace před call se nevracejí ani při timeoutu. Každý retry a critic je samostatný pokus se samostatnou rezervací. Před samostatně schváleným AI provozem ověřte retenci/ceny a případný skutečně vynutitelný provider hard cap; soft budget alert není finanční garance.

```sh
# Po bezpečném nastavení variables/secret; provede skutečné budgetované volání.
npm run test:live
```

Test vypíše pouze výsledková metadata, ne analyzovaný obsah nebo klíč. Bez použitelné konfigurace skončí s chybou a nic neověří.

## Pipeline a limity

Validace → pravidla → bounded queue → AI worker → schema + evidence + safety → JSON. `GET /api/session` založí podepsanou anonymní session a vrátí veřejný režim; `GET /api/health` vrací stav procesu a `ai_configured`, které neznamená ověřené credentials ani volný rozpočet. `POST /api/analyze`: `{ "type": "text", "content": "…", "ai_consent": true }`. URL používá `type: "url"`, ale její obsah se nikdy nestahuje.

Limity: 10 000 znaků, 16 000 UTF-8 bytes, JSON body 64 KiB, konservativní input token horní mez včetně schématu a framing rezervy, output cap 1400, timeout celého jobu 20 s. Tokenové nastavení musí odpovídat zvolenému modelu. Fronta max. 20 čekajících, 2 workers; IP 20/min a podepsaná relace 10/min. IP se bere ze socketu, nikoli X-Forwarded-For. Režim `GUARD_COOKIE_SECURE=true` je pro HTTPS. Limiter i podpis relace jsou procesové, při restartu se obnoví; globální finanční limit je trvalý. Cookies/bot limity samy neprokážou skutečného člověka.

Jednoduché případy mají 1 call. Routing podle délky/signálů vybere model; při `AI_CRITIC_ENABLED=true` může vysoká nejistota, riziko či rozpor způsobit právě 1 další průchod. Default critic false; nejistota se v odpovědi přizná. Retry default 0, max. 1 jen po explicitní 429/503; timeout či neznámý síťový stav bez retry. Plná fronta, budget nebo vadná AI odpověď vrací český dočasný stav, nikdy automatický rules fallback v AI režimu.

Výsledek obsahuje engine, score/level, summary, signály s `source`, bezpečné šablony doporučení, uncertainty, critic_used a limity. Skóre bere vyšší z AI a rules baseline, nikoli průměr či pravděpodobnost. Modelové evidence se soukromě kontrolují proti vstupu a nezobrazují se; server nepřebírá modelové kontakty ani akční instrukce.

## Co ještě není hotové

Skutečné OpenAI volání a kvalita jeho odpovědí musí být ověřeny; simulace v testech to nenahrazuje. Multi-host workers potřebují implementovaný sdílený broker, atomické účetnictví a globální IP/session limity; `AI_DEPLOYMENT_MODE` jiný než single-host je nyní blokovaný. CAPTCHA má pouze serverové injektovatelné rozhraní; `GUARD_REQUIRE_BOT_CHECK=true` bez verifikátoru blokuje analýzy. Následují screenshoty, pak PDF, dataset, feedback, chráněný admin a bezpečnostní/uživatelské testy. Žádný produkční deployment ani GitHub push není součástí této etapy.


## Schválený design

Canonical visual reference: **`docs/design/VERIM_VISUAL_REFERENCE.png`**, character reference **`docs/design/VERIM_CHARACTER_REFERENCE.png`** (Robo; Věrka od refreshe 2026-10 podle šesti PNG v `public/assets/characters/`), obě fyzicky uložené. [Design systém](docs/design/DESIGN_SYSTEM.md) stanovuje tokeny a role Věrky/Roba. [Evidence assetů](docs/design/ASSETS.md) obsahuje schválené produkční PNG používané UI včetně společného hero. Reference se nikdy nevkládají do webu ani z nich nevystřihujeme části.

## Security Gate 1 a cloudový provoz

Samostatné nové Ubuntu24.04 VPS + Docker Compose + Cloudflare Tunnel/WAF/DNS; domácí deployment zrušen. [Deployment plán](docs/DEPLOYMENT_PLAN.md) a [přesný VPS/deploy/rollback runbook](docs/security/OPERATIONS.md). Lokální hardening a testy dokončeny, **public deployment BLOCKED** do uzavření P0/P1 [release gate](docs/security/SECURITY_RELEASE_GATE.md).

[STRIDE threat model](docs/security/THREAT_MODEL.md), [Cloudflare trust/config](docs/security/CLOUDFLARE_SECURITY.md), [testy a scan výsledky](docs/security/VALIDATION_REPORT.md). Žádná produkce/AI/DNS/Tunnel/push nebyly změněny. Budoucí agents nemají production SSH/sudo/socket/secrets/deploy rights.
