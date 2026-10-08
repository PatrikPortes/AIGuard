# Report etapy 3 — serverová textová AI pipeline

## Implementováno

Provider rozhraní `complete`, OpenAI-compatible HTTPS adaptér se strict JSON schema, oddělení systémových instrukcí a nedůvěryhodného JSON pole obsahu, skutečný HTTP transport bez přesměrování, kontrola výstupní velikosti/truncation/refusal a schématu. Pravidla zůstávají první vrstvou. Routing podle komplexity, jeden standardní call, volitelný podmíněný critic, pevné serverové ověřovací šablony, evidence musí být doslovný úryvek vstupu a nevstupuje do veřejného výsledku. Nejistota není matematická pravděpodobnost.

Bounded queue + worker rozhraní, souběžné limity, per-IP a podepsaná anonymní session, atomické trvalé SQLite rezervace před každým call včetně retry/critic, denní počet, denní budget a celkový budget. Timeout zahrnuje frontu, retry a critic. Timeout nevrací rezervovanou cenu. Default retry 0, max. 1 jen při explicitní 429/503. Graceful české overload/capacity chyby a žádný skrytý rules fallback v AI režimu. Chybějící/neplatná konfigurace a nefunkční účetní evidence nedovolí call. Frontend mluví pouze s vlastním serverem; před AI předáním vyžaduje souhlas. Secrets nejsou statický asset ani veřejná konfigurace.

## Testy

39/39 automatických testů prošlo, 0 selhalo, 0 přeskočeno. Testy pravidel, schématu, unsupported evidence, příkladů injection/unsafe output, routingu, critic budgetu, retry budgetu, timeout/cancel, rate limitu/session/forged cookie/X-Forwarded-For, CAPTCHA fail-closed, lokálního HTTP provider adaptéru, refusalu/truncation/malformed/redirect/oversize. Budget má test restartu, půlnoci, nedostupné DB a 4 souběžných worker threads sdílejících stejný soubor. Queue test 10 000 jobů dovolil 1 aktivní + 2 čekající a odmítl 9 997. Celý HTTP textový tok se skutečným adaptérem proti **simulovanému LLM serveru** prošel.

`npm run check` prošlo. Navazující vizuální změna navíc prošla skutečným Chromium smoke testem; nemění backend.

## Co není ověřeno

**Skutečný OpenAI textový call neproběhl.** Kontrola aktuální konfigurace i názvů/přítomnosti odpovídajících proměnných neodhalila žádný použitelný AI klíč/binding. Simulovaný provider v testech neověřuje kvalitu ani sémantickou injection odolnost skutečného modelu. Runtime neobsahuje mock. Bez aktivace je explicitní rules režim; AI režim bez konfigurace vrátí nedostupnost.

Multi-host broker, globální distribuované IP/session limity a sdílené multihost účetnictví jsou architektonicky vymezené, ale neimplementované; multihost konfigurace je blokovaná. CAPTCHA je injektovatelná brána, konkrétní služba ani frontend challenge nejsou implementované. Veřejný hosting, produkční škálování, skutečná efektivita detekce a retence poskytovatele nejsou ověřeny. Jednoduché výstupní safety filtry nejsou důkaz úplné odolnosti proti prompt injection.

## Požadované nastavení

Secret `GUARD_LLM_API_KEY` pouze v bezpečném nastavení prostředí, pro HTTPS destinaci `api.openai.com`. `AI_MODE=ai`; dostupný model se strict JSON schema v `AI_MODEL_SIMPLE` a případně `AI_MODEL_COMPLEX`. `AI_INPUT_USD_PER_MILLION` a `AI_OUTPUT_USD_PER_MILLION` jsou operátorem ověřené horní ceny přes oba modely; nejsou předvyplněné odhadem. Kladné `AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_BUDGET_MICRO_USD`, `AI_TOTAL_BUDGET_MICRO_USD`; výchozí 0 blokuje vše. Persistentní `AI_BUDGET_DB`, nikdy nesmazat kvůli restartu. Doporučený první test: 1 pokus, critic false, retries 0, budget podle ověřených sazeb; příklad nejvýše 1 USD denně i celkem. Endpoint a další limity viz `.env.example` a README.

Po dodání a promítnutí bezpečné konfigurace spustit `npm run test:live` a následně test přes HTTP/UI. Skript analyzuje pouze syntetickou rodinnou zprávu a vypíše výsledková metadata. Do té doby je etapa 3 externě blokovaná a screenshot/PDF etapy se nezačínají.

Žádný produkční deployment, Git commit/push ani publikace prostředí nebyly provedeny.


## Uložená cloudová konfigurace

Potvrzeno uložení `install_script`, `start_skill`, požadavku na secret `GUARD_LLM_API_KEY` a AI modelových/cenových/budget proměnných. K secret destinacím a síťovému návrhu přidána doména `api.openai.com`. Výchozí AI_MODE zůstává rules a budgety 0; žádná tajná hodnota nebyla zadána. Draft neaplikuje konfiguraci ani nic nenasazuje. Pro aktivaci uživatel zkontroluje a uloží nastavení a následně publikuje cloudové prostředí. Publikace neproběhla.

Nový `npm start` s podporou platformní proxy ověřen na portu 3001, protože 3000 byl obsazen: health má mode rules, homepage novou značku, funkční textový HTTP request 200 s very_high. To stále není skutečný AI test.
