# Stage 12a – schválení architektury a příprava implementace (varianta A)

- **Datum:** 2026-10-15
- **Navazuje na:** `docs/STAGE12_ANALYTICS_PROPOSAL.md` (`4f42886`), schválená varianta A.
- **Stav:** posouzení a upřesnění. Nic není implementováno ani nasazeno; web, API, databáze ani Docker se nemění.
- **Primární zdroje** (staženo 2026-10-15):
  - zákon č. 127/2005 Sb. o elektronických komunikacích, § 89 odst. 3 (zakonyprolidi.cz);
  - EDPB *Guidelines 2/2023 on Technical Scope of Art. 5(3) of ePrivacy Directive*, verze 2 (říjen 2024), odst. 31–34, 42–43, 52–56.

> **Toto není právní stanovisko.** Jde o technicko-právní rozbor pro zadání advokátovi nebo DPO. Body označené **⚖ OTÁZKA** musí potvrdit právník, než se měření zapne v produkci.

---

## 0. Verdikt a doporučení

**Implementaci lze zahájit, s podmínkami:**
1. **A1–A3 smí začít hned**, protože vše je za přepínačem `BEHAVIOR_STATS`, výchozí stav vypnuto, a dimenze zařízení má vlastní přepínač `BEHAVIOR_DEVICE`, také vypnutý.
2. **Zapnutí v produkci (A5) až po A0**, tedy po písemném závěru právníka k otázkám ⚖ 1–6 a po úpravě `privacy.html`.
3. **Rozlišení mobil/desktop je právně nejméně jisté.** Podle EDPB odst. 43 může pod čl. 5 odst. 3 spadat i sběr z hlavičky User-Agent. Bez kladného závěru A0 se dimenze nezapne a karta ukáže „neměřeno“.
4. **Cloudflare Web Analytics** na `/` a `/privacy` je podle EDPB odst. 33 a 53 pravděpodobně v působnosti § 89 odst. 3 a výjimka se na něj pravděpodobně nevztahuje. Doporučuji ho **odstranit** (varianta A ho pro počty načtení nahradí), nebo podmínit souhlasem. Rozhodnutí patří do A0; změna je samostatná schválená úprava veřejného webu (A5b).

**Shrnutí změn oproti návrhu Stage 12:**
- měření zařízení je za samostatným přepínačem;
- ochrana malých hodnot (k = 5, doplňková supresi, potlačení na serveru adminu);
- jediný zdroj pravdy pro dokončené kontroly zpráv;
- agregace v paměti místo fronty událostí;
- snapshot chování jen za 190 dní;
- omezení CHECK v SQL;
- `firm_search` rozdělený na hledání a stránkování;
- filtr na skutečné navigace (`Sec-Fetch-Mode/Dest`).

---

## 1. Právní posouzení

### 1.1 Rámec
- **§ 89 odst. 3 ZEK** (ověřené znění):
  > „Každý, kdo hodlá používat nebo používá sítě elektronických komunikací k ukládání údajů nebo k získávání přístupu k údajům uloženým v koncových zařízeních účastníků nebo uživatelů, získá od těchto účastníků nebo uživatelů předem prokazatelný souhlas s rozsahem a účelem jejich zpracování. Tato povinnost neplatí pro technické ukládání nebo přístup výhradně pro potřeby přenosu zprávy prostřednictvím sítě elektronických komunikací nebo je-li to nezbytné pro potřeby poskytování služby informační společnosti, která je výslovně vyžádána účastníkem nebo uživatelem.“

  Česká úprava **nemá výjimku pro měření návštěvnosti**.
- **EDPB 2/2023:**
  - odst. 32–33: přístup nastává, když subjekt dá zařízení pokyn poslat informaci, např. *„JavaScript code, where the accessing entity instructs the browser … to send asynchronous requests with the targeted information … clearly falls within the scope“*;
  - odst. 53: výsledky lokálního zpracování odeslané na server jsou „gaining of access“;
  - odst. 42–43: i identifikátory a kontextová data protokolu (*„HTTP header including ‘accept’ field or user agent“*) **mohou** vést k aplikaci čl. 5 odst. 3, pokud se na ně spoléhá ke sběru informací;
  - odst. 55: IP adresa pocházející ze zařízení (IPv6, statická IPv4) je v působnosti;
  - odst. 56: působnost **neznamená automaticky** souhlas; výjimky se posuzují zvlášť.
- **GDPR:** IP adresa a User-Agent mohou být osobní údaje. Agregáty bez možnosti identifikace osobními údaji nejsou (recitál 26); přechodné zpracování v paměti ale ano.

### 1.2 Posouzení jednotlivých složek

| Složka | Co se děje | § 89/3 (ePrivacy) | GDPR | Závěr a jistota |
|---|---|---|---|---|
| **Počet načtení stránek** (`page_view`) | Server započítá požadavek na HTML stránku, kterou si uživatel vyžádal. Nic se neukládá do zařízení ani se z něj nic dalšího nevyžaduje. | Nepoužívá informaci *ze zařízení* nad rámec samotného požadavku. Cesta požadavku je obsah vyžádané služby, ne identifikátor. | Ukládá se jen počet za den bez identifikátoru, tedy anonymní agregát. Přechodné zpracování požadavku je nutné pro poskytnutí stránky. | **Pravděpodobně v pořádku bez souhlasu** (vysoká jistota). ⚖ 1: potvrdit. |
| **Odeslané, dokončené a neúspěšné kontroly** | Počty serverových API požadavků, které uživatel výslovně odeslal | Stejně jako výše | Stejně jako výše; dnes už existuje (`daily`) a je popsáno v `privacy.html` | **Pravděpodobně v pořádku** (vysoká). ⚖ 1. |
| **Filtr navigací** (`Sec-Fetch-Mode`, `Sec-Fetch-Dest`, `Sec-Purpose`) | Čtení metadat požadavku jen pro vyřazení prefetch a ne-navigačních požadavků; neukládá se | Metadata protokolu (EDPB odst. 43); slouží ke správnému vyřízení a k neukládání | — | **Nízké riziko** (střední jistota). ⚖ 2. |
| **Rozlišení mobil/desktop** (`User-Agent`, `Sec-CH-UA-Mobile`) | Hlavičku poslanou kvůli načtení stránky server využije **k analytickému účelu** (zařazení do třídy), pak ji zahodí | **EDPB odst. 43 výslovně uvádí user agent.** Účel je analytický, ne nezbytný pro službu, takže výjimka se pravděpodobně neuplatní. Opačný výklad: informace se nevyžaduje aktivně, prohlížeč ji posílá vždy a ukládá se jen nevratná třída. | Přechodné zpracování UA (osobní údaj ve spojení s IP) pro analytiku, právní titul oprávněný zájem; výsledkem je anonymní agregát | **Nejistá oblast.** Výchozí stav vypnuto (`BEHAVIOR_DEVICE=0`). ⚖ 3. |
| **Přechody z úvodu** (A4, `Referrer-Policy: same-origin`) | Prohlížeč by posílal cestu předchozí stránky **jen na vlastní doménu**; server uloží výčet stránky | Hlavička `Referer` je informace ze zařízení (historie navigace) a změnou politiky ji web **aktivně vyžaduje** | Přechodné zpracování | **Zvýšené riziko**, ponechat volitelné. ⚖ 4 a samostatné schválení. |
| **Cloudflare Web Analytics** (existující, `/` a `/privacy`) | JS beacon z `static.cloudflareinsights.com` čte měření výkonu a navigace v prohlížeči a odesílá je Cloudflare | **JavaScript, který dává prohlížeči pokyn poslat informace** (EDPB odst. 33, 53), je v působnosti. Výjimka „nezbytné pro vyžádanou službu“ se na měření návštěvnosti pravděpodobně nevztahuje. Bez souhlasu je to **compliance riziko**. | Cloudflare jako zpracovatel (smluvní podmínky DPA), předávání mimo EU (Cloudflare uvádí certifikaci EU–US DPF) | **Doporučení:** odstranit, nebo podmínit souhlasem. ⚖ 5. |
| **Cookie `__Host-guard_session`** (existující) | Relace pro limity AI (24 h, HttpOnly, Strict) | Uložení do zařízení; výjimku „nezbytné“ lze opřít o ochranu služby, kterou si uživatel vyžádal (AI kontrola). Analytika ji **nesmí používat**. | Pseudonymní identifikátor pro ochranu služby | Mimo rozsah Stage 12; analytika ji nečte (technický zákaz a test). ⚖ 6 jen pro úplnost. |
| **Cloudflare Turnstile** (smlouva, pokud je zapnutý) | Ochrana proti robotům | Bezpečnostní nezbytnost, typicky obhajitelná | Cloudflare | Mimo rozsah; zmínka pro úplnost posouzení |
| **Snapshot a administrace** | Agregáty na VPS a admin za Cloudflare Access | — | Anonymní agregáty; přístup jen správce | V pořádku |

### 1.3 ⚖ Otevřené otázky pro právníka
1. Je počítání načtení stránek a odeslaných kontrol do denních součtů bez identifikátorů mimo § 89 odst. 3 a lze ho opřít o oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR)?
2. Spadá čtení `Sec-Fetch-*` a `Sec-Purpose` jen k vyřazení prefetch a ne-navigačních požadavků pod § 89 odst. 3?
3. **Rozlišení mobil/desktop:** spadá zařazení podle User-Agent nebo `Sec-CH-UA-Mobile` (bez uložení hlavičky, jen třída v denním součtu) pod § 89 odst. 3? Pokud ano, je k dispozici výjimka, nebo je nutný souhlas? Bez souhlasu dimenzi nespouštět.
4. Vyžadovala by změna na `Referrer-Policy: same-origin` za účelem měření přechodů souhlas?
5. **Cloudflare Web Analytics:** potvrdit, že bez souhlasu je v rozporu s § 89 odst. 3, a zvolit nápravu: odstranit, nebo podmínit souhlasem. Doporučuji odstranit.
6. Jaké informace doplnit do `privacy.html` a záznamu o činnostech zpracování (čl. 30)? Je potřeba test oprávněného zájmu (LIA)? DPIA podle čl. 35 pravděpodobně ne: jde o anonymní agregáty bez profilování, nikoli rozsáhlé systematické monitorování.
7. Dozorový úřad pro § 89 odst. 3 (ÚOOÚ / ČTÚ) a jeho aktuální metodika k analytice bez cookies: ověřit.

### 1.4 Informační povinnost (návrh textu pro `privacy.html`, schválí A0)
> **Souhrnné počty použití webu.** Server počítá, kolikrát byla načtena jednotlivá stránka a kolik kontrol bylo odesláno a dokončeno. Ukládáme pouze denní součty. Neukládáme IP adresy, informace o prohlížeči, cookies, identifikátory, obsah zpráv, formulářů, adres ani výsledky kontrol. Z čísel nelze zjistit, kdo web používal. Souhrny mažeme po 400 dnech. Právní základ: oprávněný zájem na provozu a zlepšování služby. *(Věta o rozlišení mobil/desktop jen podle závěru ⚖ 3.)*

---

## 2. Bezpečnostní kontrola datového modelu, agregací a retence

| # | Nález | Riziko | Úprava návrhu (závazná pro implementaci) |
|---|---|---|---|
| S1 | Fronta workeru má dnes limit **64** zpráv společný pro `record`. Načtení stránek by frontu zahltila a **zahazovala by dokončené kontroly**. | Ztráta dnešní statistiky | **Agregace v paměti hlavního vlákna:** `Map` s klíčem `event\|k1\|k2`, nejvýš 200 klíčů. Každých 5 s jedna zpráva workeru s celým balíkem; při chybě se balík zahodí. Existující cesta `record(mode)` pro `daily` zůstává **beze změny a oddělená**. |
| S2 | Textové sloupce `event`, `k1`, `k2` | Vložení libovolného textu chybou kódu | Výčty v kódu (`Object.freeze`) + **`CHECK(event IN (…))`, `CHECK(k1 IN (…))`, `CHECK(k2 IN (…))`** v SQL; neznámá hodnota se zahodí před zápisem. Test: zápis hodnoty mimo výčet selže na obou úrovních. |
| S3 | Velikost snapshotu: admin dnes odmítne soubor nad **131 072 B** | Chování by snapshot nafouklo (400 dní × až 100 řádků ≈ 2,4 MB) | Snapshot obsahuje **chování jen za 190 dní** (90 + srovnání + rezerva) jako kompaktní pole `[den, kód události, k1, k2, n]`, nejvýš 120 řádků za den. Limit adminu se zvedne na **1 MiB**. DB drží 400 dní. |
| S4 | Retence | Smazaná data zůstávají ve volných stránkách SQLite | `PRAGMA secure_delete=ON` pro tabulku chování. Denní `DELETE` starších 400 dní (roboti 90 dní). Zálohy DB se řídí stejnou retencí, nebo se DB chování nezálohuje (agregáty jsou postradatelné). |
| S5 | Snapshot je `0444` v `/opt/verimtomu/usage-export` | Čitelný pro účty na VPS | Obsahuje jen agregáty bez identifikátorů. Malé hodnoty se potlačují až v adminu (§ 3). Přijatelné a zdokumentované. |
| S6 | Klasifikace UA regulárním výrazem | ReDoS, chybné zařazení | UA se zkrátí na 512 znaků, klasifikace přes `includes` nad pevnými tokeny (žádné vnořené kvantifikátory); test s 10 000 znaky < 1 ms |
| S7 | Nafouknutí `page_view` skriptem (GET bez prohlížeče) | Zkreslení, ne únik | Počítat jen požadavky s `Sec-Fetch-Mode: navigate` a `Sec-Fetch-Dest: document`, které posílají prohlížeče; bez nich jen do `bot_page_view`. `Sec-Purpose: prefetch/prerender` se nepočítá. Strop řádků zůstává pevný (výčty). Karta zobrazí srovnání s HTTP požadavky z Cloudflare. |
| S8 | Propojení s identitou | Spojení s kvótami a relacemi | Modul `behavior-stats.js` nesmí importovat `visitor-quota.js`, `limits.js`, session ani `client-ip.js` (test statickou kontrolou importů). Ukládá se jen den, žádný čas. |
| S9 | Selhání měření | Dopad na odpovědi | Volání jen po `finish`, celé v try/catch. Chyba workeru měření vypne (jeden řádek v logu s kódem) a odpověď se nemění; test s vyhozenou výjimkou. |
| S10 | Validace v adminu | Podvržený nebo poškozený snapshot | Admin ověří verzi, velikost, výčty, jedinečnost klíčů, `n` jako bezpečné celé číslo 0–10⁷ a dny ve správném rozsahu. Při chybě se celé chování zahodí a karta ukáže „nedostupné“; ostatní karty fungují. |
| S11 | Přechod na nový den (`Europe/Prague`, DST) | Chybné dny | Stejná funkce `usageDay` jako dnes; test kolem změny času |
| S12 | Rozšíření 12b | Zavlečení identifikátorů | Schéma rezervuje jen názvy událostí 12b (`check_started`, `result_viewed`, `cta_click`, `page_engaged`), **ne** sloupce pro token. Jakékoli rozšíření vyžaduje novou etapu se souhlasem. |

**Model po úpravách:**
```sql
PRAGMA secure_delete=ON;
CREATE TABLE IF NOT EXISTS behavior_daily(
  day   TEXT NOT NULL CHECK(length(day)=10),
  event TEXT NOT NULL CHECK(event IN ('page_view','bot_page_view','check_submitted','check_completed','check_failed','check_rejected')),
  k1    TEXT NOT NULL CHECK(k1 IN (/* 12 stránek + not_found + 8 kontrol: generováno z výčtu v kódu */)),
  k2    TEXT NOT NULL DEFAULT '' CHECK(k2 IN ('', 'mobile','desktop','unknown','rules','ai','fallback','rate_limited','quota','timeout','upstream','client_abort','search','page')),
  n     INTEGER NOT NULL CHECK(n BETWEEN 0 AND 10000000),
  PRIMARY KEY(day,event,k1,k2)
) WITHOUT ROWID;
```

---

## 3. Ochrana proti zpětnému dopočítání malých hodnot

**Hrozba:**
- Kartu vidí jen správce (Cloudflare Access), ale snímky obrazovky a exporty mohou odejít dál.
- Při malém provozu (např. jedna kontrola smlouvy za den) jde z čísla spolu s vnější znalostí („kamarád mi říkal, že to včera zkoušel“) odvodit čin konkrétní osoby.
- Hodnoty lze dopočítat rozdílem: celek minus zobrazené části, okno 28 dní minus okno 7 dní, dnešek minus včerejšek.

**Pravidla (závazná, prosazuje je server adminu v reportu, ne jen UI; malé hodnoty do prohlížeče vůbec neodejdou):**

| # | Pravidlo | Detail |
|---|---|---|
| P1 | **Práh k = 5** | Každá zobrazená buňka 1–4 se nahradí „< 5“ (`{suppressed:true}`, bez čísla). Nula se zobrazuje jako 0 („nikdo“ nic neodhaluje o konkrétní osobě). |
| P2 | **Doplňková suprese** | V každé skupině se zobrazeným součtem (stránky, kontroly, důvody, zařízení): pokud je potlačena přesně jedna buňka, potlačí se i nejmenší další nenulová buňka. Pokud by tak potlačená část byla jediná nepotlačená, potlačí se i součet skupiny. Iterovat do stabilního stavu. |
| P3 | **Odvozené hodnoty** | Poměry a procenta jen při čitateli i jmenovateli ≥ 5 a jmenovateli ≥ 20; zaokrouhlení na celá procenta (pod 100 ve jmenovateli na 5 p. b.). Rozdíl proti předchozímu období jen při obou hodnotách ≥ 5. |
| P4 | **Granularita** | Rozpad podle dimenze (stránka, kontrola, zařízení, důvod) **jen za celé období** (7/28/90), nikdy po dnech. Denní graf jen pro celkové načtení stránek a celkem dokončené kontroly, dny s 1–4 jako pás „< 5“. |
| P5 | **Okna** | Okna končí posledním úplným dnem (včerejšek); dnešek se nezobrazuje. Omezí to dopočet „po hodinách“ opakovaným načítáním. |
| P6 | **Snapshot vs. zobrazení** | Surové agregáty zůstávají na VPS (S5). Potlačení se aplikuje v `admin/src/behavior-report.js`. `/api/dashboard` vrací už potlačené hodnoty (test: odpověď neobsahuje žádné číslo 1–4 v polích chování). |
| P7 | **Zbytkové riziko** | Rozdíl mezi dvěma pozorováními v různých dnech (např. 7denní součet včera a dnes) může odhalit hodnotu jednoho dne. Proti dlouhodobému pozorovateli s přístupem k adminu by pomohl jen šum (diferenciální soukromí). Ten **nenavrhuji**: přístup má jen správce a šum by poškodil čitelnost. Riziko přijato a zdokumentováno. |

**Test (A3):** generátor náhodných skupin. Pro každou ověří, že z výstupu nelze žádnou potlačenou buňku dopočítat lineárně (součty skupin a doplňků) na jedinou hodnotu 1–4.

---

## 4. Dvojí započítání proti existujícím dokončeným ověřením

**Dnes:**
- `countOnFinish` (`src/usage-stats.js`) přičte do `daily(rules|ai|fallback)` každou úspěšně doručenou odpověď **`/api/analyze` mimo téma `loan`**;
- karta „Dokončená ověření“ zobrazuje tato čísla.

| # | Situace | Riziko | Rozhodnutí |
|---|---|---|---|
| D1 | Dokončená kontrola zprávy by se zapsala do `daily` i `behavior_daily` | Dvojí zdroj, rozjetí čísel, sčítání v UI | **Jediný zdroj pravdy:** `check_completed` pro `message` se do `behavior_daily` **nezapisuje**; report chování ho čte z `daily` (rules + ai + fallback). V `behavior_daily` je pro zprávu jen `check_submitted`, `check_failed` a `check_rejected`. Test: hodnota v kartě Chování = hodnota v kartě Dokončená ověření. |
| D2 | `check_submitted` a `check_completed` u zprávy musí mít stejnou bránu | Nesmyslná úspěšnost nad 100 % | `check_submitted{message}` se zaznamená **po** `pipeline.validate` a **mimo** `topic=loan`, tedy stejný filtr jako `completedMode`. Test: pro každou cestu (pravidla, AI, fallback, odmítnutí AI, časový limit, 429) platí `submitted ≥ completed` a `submitted = completed + failed + (přerušené)`. |
| D3 | Téma `loan` jde přes stejný `/api/analyze` | Míchání zpráv a půjček | Klíč `loan_text` zvlášť. Do `daily` se nepočítá (stejně jako dnes), v chování se počítá samostatně; nikdy se nesčítá se zprávou. |
| D4 | **`/api/firm` volá i tok kontroly zprávy s IČO** (`public/check-flow.js:110`) a půjčky | Dotazy na firmu nejsou jen ze stránky Firma; poměr „odesláno / načtení `/proverit-firmu`“ by byl nesmyslný | Klíč `firm` se jmenuje „Dotazy do registru firem (ze všech stránek)“. **Nezobrazuje se** v konverzní cestě stránky Firma ani se nesčítá s kontrolami zpráv. Poměr k načtení stránky firmy jen po A4 (zdrojová stránka z vlastního referreru), jinak „neměřitelné“. |
| D5 | `/api/firm-search` se stránkováním (`start`) | Další stránka výsledků by se počítala jako nové hledání | `k2='search'` pro `start` 0 nebo chybějící, `k2='page'` pro `start > 0`. Do cesty se počítá jen `search`. |
| D6 | Opakování po chybě a opětovné odeslání téhož textu | Jeden člověk = více odeslání | Shodně s dnešní praxí jde o počet **požadavků**. V UI „odeslání“, nikoli „lidé“. Úspěšnost = dokončeno / odesláno (požadavky). |
| D7 | `/api/session` (GET před odesláním) | Počítat jako zahájení | Nepočítá se |
| D8 | `/api/check` | Uživatelské UI ho dnes nevolá (žádná reference v `public/`) | Klíč `check` existuje, očekává se 0. Test: UI toky ho nevolají. |
| D9 | Tři různé „návštěvnosti“: Cloudflare HTTP požadavky (karta Cloudflare), Cloudflare Web Analytics, `page_view` | Sčítání nesouvisejících metrik | Nikdy se nesčítají. Karta Chování uvádí, co je `page_view`, a karta Cloudflare zůstává beze změny. |
| D10 | Ztráta při přetížení (fronta `daily` 64, agregace chování v paměti) | Rozjetí obou zdrojů | Díky D1 nehrozí rozjetí u zpráv. U ostatních: ztráta jen při pádu procesu (nejvýš 5 s dat), zdokumentováno. |
| D11 | Turnstile u smlouvy | Odmítnutí výzvy jako nedokončená kontrola | `check_rejected{contract}`, nikoli `check_failed` |

---

## 5. Acceptance criteria A0–A5

Obecně pro každou etapu:
- samostatná větev a commit, push, nic do `main` ani do produkce bez schválení;
- kořenová brána (Docker `validated`: `node --test`, strict gate 16/16, `npm run check`) a testy adminu zelené;
- žádné tajemství v commitu;
- rollback popsaný a vyzkoušený.

### A0 – Právní posouzení a informace (bez kódu)
- [ ] Písemný závěr k ⚖ 1–7 od advokáta nebo DPO, uložený mimo repozitář; v repozitáři jen shrnutí rozhodnutí.
- [ ] Rozhodnutí: dimenze zařízení **ano/ne**; A4 **ano/ne**; Cloudflare Web Analytics **odstranit / souhlas**.
- [ ] Schválený text pro `privacy.html` (§ 1.4) a záznam o činnostech zpracování.
- [ ] LIA (test oprávněného zájmu) zdokumentován, pokud ho právník vyžaduje.

**Rollback:** nic.

### A1 – Záznam událostí ve webu (vypnuto)
- [ ] `src/behavior-stats.js`: výčty, agregace v paměti (S1), flush po 5 s do workeru, `behavior_daily` s CHECK (S2), `secure_delete`, retence 400/90 dní (S4).
- [ ] `page_view` jen pro HTML cesty z mapy, GET, `200` po `finish && writableFinished`, s `Sec-Fetch-Mode: navigate` a `Sec-Fetch-Dest: document`, bez `Sec-Purpose` prefetch/prerender, bez 304. Ostatní do `bot_page_view` (S7).
- [ ] Kontroly podle § 4 (D1–D11); `message` completed se **nezapisuje** (D1).
- [ ] Snapshot v2: pole `behavior` 190 dní (S3); pole `days` beze změny pro admin v1.
- [ ] **Bez `BEHAVIOR_STATS=1` je chování bit-identické:** stejné odpovědi, hlavičky a soubory; test porovná snapshot v1.
- [ ] `BEHAVIOR_DEVICE` výchozí 0: `k2` pro `page_view` je vždy `''` a UA se vůbec nečte (test se špehovacím objektem hlaviček).

**Testy:**
- jednotkové pro každou definici (prefetch, HEAD, 304, 404, robot, chybějící `Sec-Fetch-*`, přerušení, 429, kvóta, časový limit, Turnstile);
- invarianty D2;
- odmítnutí hodnot mimo výčet (kód i SQL);
- v DB a snapshotu se neobjeví text, query, IP, UA ani čas jemnější než den;
- statická kontrola importů (S8);
- výkon: 100 000 záznamů v hlavním vlákně < 100 ms celkem, paměť agregace < 1 MB;
- pád workeru nemění odpovědi (S9);
- přechod času (S11).

**Rollback:** `BEHAVIOR_STATS=0` (výchozí); tabulka zůstane a nic neovlivní.

### A2 – Vyřazení technických volání
- [ ] Healthcheck (`/api/health`) a smoke testy releasu se nepočítají: smoke posílá `X-Verimtomu-Smoke: 1` a server ho respektuje jen ze `127.0.0.1` nebo `::1`.
- [ ] Release smoke v simulaci nezvýší `page_view` ani `check_*`.

**Testy:** jednotkové a release smoke v simulaci.

**Rollback:** revert commitu.

### A3 – Karta „Chování návštěvníků“ v adminu
- [ ] `admin/src/usage.js` v2: validace S10, limit 1 MiB (S3); admin v2 přijme snapshot v1 (bez chování), tedy karta „data zatím nejsou“.
- [ ] `admin/src/behavior-report.js`: P1–P6 na serveru a výpočty § 5.4 návrhu. Štítky „Naměřeno/Odhad“ u každé hodnoty; přepínač 7/28/90; okna končí včerejškem.
- [ ] Hodnota „Dokončené kontroly zpráv“ v kartě Chování = hodnota v kartě Dokončená ověření (D1).
- [ ] Dimenze zařízení se zobrazí jen se snapshotem obsahujícím `k2` zařízení, jinak „neměřeno (vyžaduje rozhodnutí A0)“. Aktivní čas: „neměřeno“.
- [ ] Pátá karta v liště (Stage 11): ARIA, klávesnice, 320–1280 px, cíle ≥ 48 px, bez CSP chyb a externích požadavků; stavový řádek „Chování: …“.

**Testy:**
- jednotkové: P1–P3 s náhodným generátorem skupin, P4–P6, validace S10, kompatibilita v1/v2;
- browser: karta, prázdné stavy, potlačené hodnoty jako „< 5“, žádné číslo 1–4 v `/api/dashboard`.

**Rollback:** `rollback-upgrade` adminu (`admin/stage10-staging.sh`).

### A4 – (volitelně, jen po kladném ⚖ 4) Zdroj navigace
- [ ] `Referrer-Policy: same-origin` jen pro HTML odpovědi; API a assety beze změny.
- [ ] `nav_from` = výčet stránky jen při stejném originu a cestě z mapy. Cizí origin, query nebo neznámá cesta se uloží jako `''`; referrer se nikdy neukládá.
- [ ] Atribuce `/api/firm` podle zdrojové stránky (D4).

**Testy:** jednotkové (cizí origin, query, fragment, neznámá cesta, chybějící hlavička) a ověření hlaviček na všech cestách.

**Rollback:** vrátit hlavičku (revert).

### A5 – Nasazení a ověření
- [ ] A0 uzavřeno; `privacy.html` upravena podle schváleného textu (samostatná schválená změna webu).
- [ ] **A5b** (podle A0): Cloudflare Web Analytics odstraněn z `/` a `/privacy` (CSP vrácena na `script-src 'self'`), nebo podmíněn souhlasem.
- [ ] Web: release se zapnutým `BEHAVIOR_STATS=1` (a `BEHAVIOR_DEVICE` podle A0) standardním release skriptem.
- [ ] Admin: upgrade stagingu.
- [ ] Po 7 dnech:
  - `check_completed{message}` v kartě Chování = `daily`;
  - `page_view` je řádově pod HTTP požadavky z Cloudflare a nad nulou;
  - žádný `bot_page_view` > 10× `page_view` bez vysvětlení;
  - DB < 5 MB;
  - snapshot < 300 kB;
  - RAM webu beze změny ± 5 MB.

**Rollback:**
- web: `BEHAVIOR_STATS=0` (restart kontejneru);
- admin: `rollback-upgrade`;
- data lze smazat `DROP TABLE behavior_daily`, aniž by to ovlivnilo `daily`.

---

## 6. Příprava na Stage 12b (neimplementovat)
- Názvy událostí 12b jsou rezervované. Schéma A je nepotřebuje a CHECK je zatím **nepovoluje**, takže rozšíření vyžaduje vědomou migraci.
- Karta Chování má místo pro „Aktivní čas“ a „Interakce“ s textem „neměřeno“.
- 12b vyžaduje vlastní posouzení A0, souhlas (opt-in) a bezpečnostní posouzení nového endpointu `/api/m`. Nic z toho není součástí 12a ani A1–A5.

---

## 7. Otevřená rizika

| Riziko | Dopad | Stav a opatření |
|---|---|---|
| ⚖ 3: zařízení podle UA může vyžadovat souhlas | Chybí odpověď na otázku 6 (mobil/desktop) | Přepínač, výchozí vypnuto; rozhodne A0 |
| ⚖ 5: Cloudflare Web Analytics bez souhlasu | **Existující compliance riziko** už dnes, nezávisle na Stage 12 | Doporučeno odstranit (A5b); rozhodnutí A0 |
| Zbytkové riziko dopočtu z opakovaného pozorování (P7) | Teoretické odhalení hodnoty jednoho dne | Přijato; přístup jen správce, Access |
| Data nejsou unikátní návštěvníci a odhady odchodu jsou hrubé | Chybná interpretace | Štítky Naměřeno/Odhad, slovník metrik v kartě |
| `page_view` nafouknutelný skriptovanými prohlížeči | Zkreslení | Filtr navigací, srovnání s Cloudflare; čísla nejsou bezpečnostně kritická |
| Bez A4 nelze přičíst `/api/firm` ke stránce | Neúplná cesta u Firmy | Zobrazeno poctivě jako „ze všech stránek“ |

## 8. Doporučení
**Ano, implementaci varianty A lze zahájit**, a to etapami **A1 → A2 → A3** za vypnutými přepínači, souběžně s A0. **Nezapínat v produkci a neměnit `privacy.html` ani Cloudflare Web Analytics, dokud A0 neuzavře otázky ⚖ 1, 3, 5 a 6.** Dimenzi zařízení (⚖ 3) a A4 (⚖ 4) považovat za podmíněné rozšíření.
