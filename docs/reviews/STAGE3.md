# Stage 3 – Check Orchestrator: závěrečné integrační review

- **Integrační commit:** `ff9615c54f388bd408d9d7915cce886a85452a03` (větev `integration/stage3-final`)
- **Produkční baseline:** `234eba77136f413454699462258c5373c72fcd98` (HEAD `release/web-checker-2-2026-10-13`)
- **Stage 3 hlava:** `76d55b2f4f0e90e97396253610fad14e5f70dc7c` (S3.8 pre-release)
- **Specifikace:** `docs/specs/SPEC_STAGE3_ORCHESTRATOR.md` (včetně kap. 12)
- **Datum:** 2026-10-14
- **Rozsah:** cílené integrační review. Nejde o obecný audit. Nic nebylo nasazeno ani mergováno do produkční větve.

## Verdikt

**GO** za podmínek uvedených v sekci „Podmínky nasazení“.

Nebyl nalezen žádný kritický ani vysoký nález.

## 1. Integrace

Merge `ff9615c` má rodiče `234eba7` (produkce) a `76d55b2` (Stage 3). Jde o standardní merge bez squashe. Merge base je `54e0058`.

| Kontrola | Výsledek |
|---|---|
| Soubory změněné jen na produkční straně (`index.html`, `privacy.html`, `smlouva.html`, `style.css`) | bajtově shodné s `234eba7` |
| Soubory změněné jen na straně Stage 3 (25 souborů) | bajtově shodné s `76d55b2` |
| Soubory lišící se od produkce mimo seznam Stage 3 | žádné |
| `public/web.html` (jediný konflikt) | rozdíl `234eba7 → ff9615c` je na úrovni tagů **totožný** se změnou Stage 3 `54e0058 → 76d55b2` |

Změny Stage 3 ve `web.html`:
- odkaz `verdict.css`;
- nepovinné pole `#web-ico` s nápovědou;
- prázdný `#check-combined`;
- `id="eshop-operator"` na existující sekci ARES.

Produkční texty zůstaly beze změny: meta description, úvodní odstavec, upozornění a odkaz na „Prověřit firmu“.

Homepage, texty a design produkce jsou zachované. Kompletní Stage 3 (S3.1–S3.8) je v integraci přítomná.

## 2. Funkčnost (ověřeno v kódu a cílenými testy na `ff9615c`)

| Požadavek | Výsledek |
|---|---|
| S3.6 Web + Firma | PASS: browser 13 scénářů na 320/375/430 px |
| S3.7 Zpráva + Web + Firma | PASS: browser 16 scénářů na 320/375/430 px |
| Neutrální výsledek F5a | zachován: neutrální nadpis a první akce ze serveru nahoře, žádné skóre ani procenta, fokus na výsledku F5a |
| URL kontroly jen v prohlížeči | `check-flow.js` volá jen `/api/session` a `/api/firm` s `{"ico"}`. Stránky nevolají `/api/check`. `/api/check` nepřijímá pole `url`. |
| Fan-out | `BUDGET = {maxSteps:4, maxUrls:2, maxIcos:1}` (P7) |
| Deadline | `deadlineMs: 5000`, ověřeno testy klientského i serverového runneru |
| Konzervativní agregace | A1–A6. Zpráva nebo web nikdy nevedou na zelenou. Selhaný povinný krok vede na „Stojí za pozornost“, selhaný primární krok na „Kontrolu se nepodařilo dokončit“. |

## 3. Release kompatibilita

| Kontrola | Výsledek |
|---|---|
| `deploy/release/verimtomu-release.sh` | beze změny proti produkci, sha256 `4ea56054…261b` |
| `Dockerfile`, `deploy/release/ai-proxy.Dockerfile`, `ai-proxy.cjs`, `deploy/`, compose, env | beze změny |
| Vazba image na commit | skript ověřuje label `org.opencontainers.image.revision == SHA` u web i relay image a shodu sloučeného stromu s release stromem |
| Produkční konfigurace | žádná nová proměnná. `AI_CONTRACT_ENABLED` a právní katalog nejsou dotčeny. |
| Síťová oprávnění | žádná nová. `src/server.js` přidává jen same-origin endpoint `/api/check` a allowlist statických assetů. Bez nového upstreamu, relay routy, změny CSP ani egressu. |
| Admission `/api/check` | Origin/session/IP, bot check, analysis sloty a `globalLimiter('analysis')`. Firm krok sdílí instance `firmClient`, `firmRequests`, `firmLimiter` a `firmSessionLimiter`. |
| Rollback | release skript beze změny. Předchozí produkční image (`234eba7`) zůstávají cílem rollbacku. |

## 4. Test evidence

### Vlastní ověření v tomto review (na `ff9615c`, sandbox)

| Test | Výsledek |
|---|---|
| Cílené Node testy (`check-*`, `message-flow`, `web-release`, `web-checker`, `eshop-checker`) | 107/107 PASS. Lokální Node 22, projekt cílí na Node 24. |
| `scripts/web-firm-browser.js` (S3.6) | PASS, 13 scénářů |
| `scripts/message-flow-browser.js` (S3.7) | PASS, 16 scénářů |
| Statická kontrola merge a infrastruktury | viz kap. 1 a 3 |

Dřívější vlastní ověření na stromu `76d55b2` (S3.8, před merge):
- Docker gate na Node 24 z čistého `git archive`: 397/397 PASS;
- Claude strict security gate 16/16 PASS;
- `npm run check` PASS.

Strom `ff9615c` se od `76d55b2` liší jen v produkčních souborech z kap. 1.

### Reportováno zadavatelem, v tomto review nepotvrzeno

Pro `ff9615c` není v repozitáři evidence (logy) a tyto běhy jsem znovu nespouštěl:
- Native Linux amd64 Docker gate 397/397 PASS;
- Security gate 16/16 PASS;
- cílené testy 120 PASS;
- browser scénáře PASS;
- `npm run check` PASS.

Release skript spouští release gate uvnitř buildu. Build z `ff9615c` při nasazení tedy gate zopakuje automaticky.

## 5. Nálezy

Kritické ani vysoké nálezy: **žádné**.

## 6. Známé neblokující technické dluhy

1. **Sedm zastaralých browser skriptů:** `security`, `beta-ux`, `loan`, `ai-loan-integration`, `ai-p0`, `ai-beta`, `ai-fallback` (`-browser.js`).
   - Selhávají stejně i před Stage 3 (`52cdf61`).
   - Testují dřívější homepage s formulářem, vstup půjčky ze stránky zprávy, starší texty a selektory. Jeden očekává HTTP 400 `AI_CONSENT_REQUIRED` a dostává 200.
   - Je potřeba je přepsat samostatně. `frontend-browser.js` byl v S3.8 opraven.
2. **`/api/check` žádná stránka nevolá.** Zůstává dostupné pro budoucí serverové flow (spec kap. 12).
3. **Společný výsledek na stránce Zpráva.**
   - Zobrazuje se jen u textu s odkazem nebo IČO, pod úvodní částí výsledku F5a, bez přesunu fokusu.
   - Ukazuje úroveň (např. „Stojí za pozornost“), nikdy ne zelenou. Jde o záměrnou odchylku od kritéria S3.5 „verdikt nad ohybem a fokus“ ve prospěch F5a.
4. **Krok firmy nevykazuje přesné kontakty se zdroji.** `/api/firm` je nereportuje, UI to uvádí textem.
5. **Web stránka má dva vstupy pro IČO:** nové pole Stage 3 a existující sekci ARES. Ta se při zadaném IČO skryje. Texty jsou konzistentní.
6. Na 320 px přetéká nadpis `h2#eshop-title` na `/proverit-web`. Stav existoval už před Stage 3.
7. Lokální `frontend/f5a-neutral-result` je starší rozpracovaná verze F5a a **nesmí se mergovat**. F5a je v produkci (`fd9f7b4`).

## 7. Podmínky nasazení

1. Nasazovat **přesně `ff9615c54f388bd408d9d7915cce886a85452a03`** existujícím `deploy/release/verimtomu-release.sh` (prepare → build → deploy → verify), pro web i relay ze stejného SHA.
2. Produkční větev `release/web-checker-2-2026-10-13` musí mít v okamžiku merge stále HEAD `234eba7`.
   - Merge `integration/stage3-final` jen jako merge commit nebo fast-forward, se stromem shodným s `ff9615c`. Skript to kontroluje.
   - Pokud se produkce mezitím posune, je potřeba nová integrace a nové review.
3. Build musí projít release gate uvnitř buildu. Doporučuji uložit jeho log jako evidenci k `ff9615c`.
4. Firewall, egress, relay a produkční env beze změny. `AI_CONTRACT_ENABLED=false`, právní katalog `[]`.
5. Ruční kontrola po nasazení:
   - `/overit-zpravu`: text bez odkazu zobrazí jen výsledek F5a. Text s odkazem a `IČO: 27082440` zobrazí F5a nahoře a pod ním „Co jsme prověřili“. V síti je jen `/api/analyze` a `/api/firm` s `{"ico"}`.
   - `/proverit-web`: URL bez IČO nevyvolá žádný API požadavek. URL s IČO pošle jen `/api/firm` s `{"ico"}`.
   - `POST /api/check` s `{}` nebo `{"url":…}` vrátí 400.
   - Homepage, `/privacy`, `/proverit-smlouvu` a `/proverit-firmu` jsou beze změny.
6. Rollback: `verimtomu-release.sh rollback` na předchozí produkční image (`234eba7`), bez změny konfigurace.
