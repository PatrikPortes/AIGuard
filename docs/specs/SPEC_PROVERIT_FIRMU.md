# Specifikace: modul „Prověřit firmu“

*Stav: FINÁLNÍ MVP ROZSAH (schváleno vlastníkem produktu 13. 10. 2026). Nic není implementováno, commitováno ani nasazeno.*
*Research proveden 13. 10. 2026 živými dotazy na oficiální rozhraní; podmínky ARES a Registru DPH přečteny z oficiálních stránek (vyrenderováno v prohlížeči).*

## 0. FINÁLNÍ MVP ROZHODNUTÍ

| # | Rozhodnutí | Důsledek ve specifikaci |
|---|---|---|
| 1 | Insolvence přes ARES je pro MVP **akceptována**. Samostatná ISIR integrace se nestaví. | Pravidla F03–F05 z ARES VR + `stavZdrojeIr`; v UI vždy odkaz „Ověřte přímo v insolvenčním rejstříku“. ISIR přímý dotaz → V2. |
| 2 | Skuteční majitelé **vynecháni**. | ESM se v UI nezmiňuje (je veřejnosti nepřístupná od 17. 12. 2025). |
| 3 | Sbírka listin / účetní závěrky **jen externí odkaz**. | Žádná datová integrace OR / dataor v MVP. |
| 4 | ČNB → **V2**. | JERRS mimo MVP. |
| 5 | MVP = **ARES + Registr DPH + deterministická pravidla + Verdict UX + externí odkazy**. | Nic dalšího; AI shrnutí je volitelné, výchozí vypnuté. |

**Uzavřené body před implementací (13. 10. 2026):**
- **ARES – podmínky:** https://ares.gov.cz/stranky/podminky-provozu (přečteno). Limit **500 dotazů/min**; dále zákaz opakovaných stejných a nesprávných dotazů, velkého počtu souběžných dotazů, obcházení limitů z více IP a náhodného propátrávání. Údaje mají „pouze informativní charakter a nemají charakter úřední listiny“. Povinná attribution není; viz 3.1.
- **Registr DPH – oficiální endpoint a podmínky:** https://adisspr.mfcr.cz/pmd/dokumentace/webove-sluzby-spolehlivost-platcu (přečteno). Endpoint `https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP`. Limity: max 100 DIČ na volání, **≤ 2 000 volání/h, ≤ 10 000 / 24 h, ≤ 4 paralelně**. Odstávky denně 0:00–0:10 a v neděli 3:00–4:00. Viz 3.2.
- **Jediný otevřený bod:** jednorázový test dostupnosti DPH endpointu z produkčního kontejneru `verimtomu-ai-proxy` (příkaz v kap. 15).

---

## 1. EXECUTIVE SUMMARY

**Účel.** Uživatel zadá IČO nebo název firmy. Modul mu odpoví na jedinou otázku:

> „Je tu něco, co bych měl vědět, než této firmě pošlu peníze, něco podepíšu nebo s ní začnu obchodovat?“

Nejde o další vyhledávač ARES. Výstupem je krátký přehled varovných signálů z oficiálních dat. U každého signálu je uveden zdroj, datum kontroly a doporučený další krok.

**Hlavní zjištění z researche:**

1. **ARES pokrývá většinu MVP jedním zdrojem.** Jde o REST v1.4.0, bez registrace a zdarma.
   - Základní údaje, Veřejný rejstřík, RES a vyhledávání podle názvu běží přes dosavadní relay, jen s dalšími pevnými cestami.
   - Veřejný rejstřík (VR) obsahuje statutáře, společníky, likvidaci, insolvenční zápisy, historii a spisovou značku.
   - RES obsahuje kategorii počtu zaměstnanců.
   - **Druhá ARES integrace nevzniká.**
2. **Registr DPH má oficiální webovou službu (SOAP) Finanční správy.** Je určená přímo „pro vzdálený přístup ze SW třetích stran“.
   - Vrací typ subjektu, příznak nespolehlivého plátce nebo nespolehlivé osoby a zveřejněné bankovní účty.
   - Ověřeno živě.
3. **Insolvenční rejstřík (ISIR) nemá ověřené oficiální veřejné API pro dotaz podle IČO.**
   - Veřejná WS `IsirPub001` je proud událostí. Pro dotaz podle IČO by bylo nutné replikovat celý rejstřík.
   - Nový eISIR (pilot) má jen interní backend pro vlastní SPA (`/rizeni/vyhledatDleDluznika`). Je nedokumentovaný, a použít ho by byl křehký scraping.
   - **MVP proto bere insolvenční údaje z ARES.** Jsou to insolvenční zápisy ve VR (`insolvence[]`, `konkursy[]`) a stav zdroje ISIR (`stavZdrojeIr`).
   - Texty k tomu jsou konzervativní a k přímému ověření vede odkaz na ISIR.
4. **Evidence skutečných majitelů je od 17. 12. 2025 veřejnosti nepřístupná.** Ověřeno na esm.justice.cz. Z MVP se vyřazuje a nezobrazujeme ani odkaz s příslibem dat.
5. **Sbírka listin a účetní závěrky** nemají oficiální strukturované API pro dotaz podle IČO.
   - Open data OR (dataor.justice.cz, licence CC BY 4.0) jsou hromadné roční dumpy.
   - MVP proto zobrazí pouze **odkaz** na výpis a Sbírku listin na or.justice.cz. Neparsujeme HTML.
6. **Rozhodování je deterministické.** Pravidla, ne AI. AI je jen volitelné shrnutí již vyhodnocených faktů; bez AI musí vše fungovat.

**Výsledek pro uživatele.** Jedna ze tří úrovní:
- 🟢 Nenašli jsme výrazné varovné signály
- 🟠 Stojí za pozornost
- 🔴 Našli jsme závažné varovné signály

Výsledek nikdy nenese skóre a nikdy netvrdí, že je firma bezpečná, důvěryhodná nebo doporučená.

---

## 2. MVP SCOPE

### V MVP

| Oblast | Zdroj | Poznámka |
|---|---|---|
| Identita (název, IČO, právní forma, sídlo, datum vzniku/zániku, DIČ, CZ-NACE) | ARES `ekonomicke-subjekty/{ico}` | už dnes přes relay, jen rozšířit whitelist polí |
| Statutární orgán, společníci, likvidace, insolvenční a konkurzní zápisy, spisová značka, základní kapitál, změny statutářů | ARES `ekonomicke-subjekty-vr/{ico}` | jen pokud `stavZdrojeVr` = AKTIVNI/ZANIKLY |
| Kategorie počtu zaměstnanců, převažující CZ-NACE | ARES `ekonomicke-subjekty-res/{ico}` | interval z oficiálního číselníku, jinak skrýt |
| Vyhledání podle názvu → kandidáti | ARES `POST ekonomicke-subjekty/vyhledat` | max 10 kandidátů, žádný auto-výběr |
| DPH: plátce / identifikovaná osoba / nespolehlivý plátce / nespolehlivá osoba / zveřejněné účty | Finanční správa RWS `getStatusNespolehlivySubjektRozsirenyV2` | jen když ARES vrátí DIČ ve tvaru CZ + 8 číslic (právnické osoby); posílá se bez „CZ“, jedno DIČ na volání; oficiální endpoint `adisrws.mfcr.cz/dpr/…` |
| Kontrola, zda zadaný účet patří mezi zveřejněné účty (volitelné pole) | stejná odpověď DPH | porovnání v aplikaci, účet se neukládá |
| Propojení s „Prověřit web“ | interní | oba směry, viz kap. 8 |
| Odkazy pro ruční ověření (ISIR, or.justice.cz výpis + Sbírka listin) | statické šablony URL s IČO | žádné stahování obsahu |
| Odkazy na veřejné zmínky (vyhledávač) | statické šablony jako ve Web Checkeru | nic se nestahuje |

### Mimo MVP (V2, kap. 13)

- ČNB JERRS (regulované finanční subjekty) – dokumentováno, ale z prostředí researche nedostupné.
- Účetní závěrky (metadata) z OR open data.
- Přímý dotaz do ISIR, jakmile bude oficiální per-IČO rozhraní.
- Živnostenský rejstřík (ARES RŽP) pro OSVČ.

### Explicitně ne

- Skuteční majitelé (ESM uzavřena).
- LinkedIn nebo jiné odhady zaměstnanců.
- Scraping Google, recenzních webů nebo HTML stránek justice.cz/ISIR.
- Placená API.
- Skóre.

---

## 3. DATA SOURCES

### 3.1 ARES – Administrativní registr ekonomických subjektů (MF ČR)

- **Dokumentace:** https://ares.gov.cz/stranky/vyvojar-info
- **OpenAPI:** https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/v3/api-docs (ověřeno, verze 1.4.0)
- **Poskytuje (ověřeno živě):**
  - `GET /ekonomicke-subjekty/{ico}`:
    - `ico`, `obchodniJmeno`, `sidlo.textovaAdresa`, `pravniForma`, `datumVzniku`, `datumZaniku`, `datumAktualizace`, `dic`, `czNace[]`, `financniUrad`;
    - `seznamRegistraci` (stavZdrojeVr/Res/Rzp/Dph/**Ir**/… s hodnotami číselníku StavZdroje: AKTIVNI, ZANIKLY, NEEXISTUJICI, HISTORICKY, BUDOUCI, POZASTAVENY, LOGICKY_SMAZANY);
    - `stavZdrojeIr` je podle OpenAPI „Stav ekonomického subjektu ve zdroji ISIR (Insolvenční rejstřík)“; ARES ho popisuje jako „Údaje z insolvenčního rejstříku“.
  - `GET /ekonomicke-subjekty-vr/{ico}` → `zaznamy[]` s polem `primarniZaznam`:
    - `spisovaZnacka`, `zakladniKapital`, `stavSubjektu`, `datumZapisu`, `datumVymazu`, `pravniDuvodVymazu`;
    - `statutarniOrgany[]` (typOrganu, clenoveOrganu s datumZapisu/datumVymazu, fyzickaOsoba/pravnickaOsoba), `spolecnici[]`, `akcionari[]`;
    - **`insolvence[]`** (`insolvencniZapis[]` s `text`, `typZapisu`, datumZapisu/datumVymazu; číselník `TypInsolvencnihoZapisu`, zdroj `vr`), `konkursy[]`, `ostatniSkutecnosti[]`.
  - `GET /ekonomicke-subjekty-res/{ico}` → `statistickeUdaje.kategoriePoctuPracovniku` (číselník `KategoriePoctuPracovniku`, zdroj `res`: 110 Bez zaměstnanců … 510 10 000+; 000 Neuvedeno), `czNacePrevazujici`.
  - `POST /ekonomicke-subjekty/vyhledat` `{"obchodniJmeno","start","pocet"}`:
    - vrací `pocetCelkem` + seznam;
    - nad 1 000 výsledků vrací chybu `CHYBA_VSTUPU` („Povoleno je maximálně 1 000 výsledků“), ověřeno.
  - `POST /ciselniky-nazevniky/vyhledat`: číselníky (ověřeno: KategoriePoctuPracovniku, StavZdroje, TypInsolvencnihoZapisu).
- **Technický přístup:** HTTPS REST/JSON, bez autentizace. Z produkce je už dnes ověřen přes `verimtomu-ai-proxy`.
- **Podmínky (ověřeno):** https://ares.gov.cz/stranky/podminky-provozu a https://ares.gov.cz/stranky/vyvojar-info
  - „Služby může využívat každý, pokud bude respektovat podmínky provozu.“ Registrace ani klíč nejsou potřeba.
  - MF si vyhrazuje omezit přístup uživatelům, kteří odešlou **více než 500 dotazů za minutu**, opakovaně posílají nesprávně vyplněné nebo stejné dotazy, mají větší počet současných dotazů, obcházejí limity z více IP nebo automatizovaně propátrávají databázi náhodnými údaji. Obnovení přístupu po zákazu jen na základě písemných záruk.
  - Údaje mají „pouze informativní charakter a nemají charakter úřední listiny“; MF neodpovídá za aktuálnost, úplnost ani škody.
  - Otevřená data ARES (https://ares.gov.cz/stranky/otevrena-data): MF „nepovažuje za vhodné modifikovat data způsobem, který by zkresloval jejich význam, bez uvedení, že tomu tak bylo učiněno“.
- **Attribution / upozornění v UI (rozhodnutí):** povinná attribution formulace v podmínkách **není**. Přesto v MVP:
  - u každého údaje z ARES uvést „Zdroj: ARES (Ministerstvo financí), stav k {datum}“;
  - pod sekcí „Kdo to je“ věta: „Údaje z ARES mají informativní charakter a nejsou úřední listinou. Pro úřední účely použijte výpis z příslušného rejstříku.“;
  - zkrácené texty zápisů (např. insolvenční) označit „zkráceno“ a nabídnout odkaz na zdroj; naše hodnocení (nálezy, verdikt) vždy vizuálně oddělit od převzatých údajů jako „naše vyhodnocení“.
- **Naše limity vůči ARES:** jeden profil = 3 volání; relay max 20 profilů/min (60 volání) + 10 vyhledávání/min, souběh 2. To je zlomek limitu 500/min. Proti „opakovaně stejné dotazy“ chrání 10min cache v aplikaci a validace IČO (checksum) před odesláním; neplatné dotazy nikdy neodejdou.
- **Omezení:**
  - VR obsahuje u fyzických osob **datum narození a adresu bydliště**, takže povinná minimalizace (kap. 9).
  - `stavSubjektu` zůstává „AKTIVNI“ i u firmy v likvidaci. Likvidaci je třeba detekovat podle orgánu typu `LIKVIDATOR` nebo podle zápisu (ověřeno na IČO 02032945).
  - Insolvenční zápisy ve VR mohou mít `datumVymazu`, tj. jsou už historické.
- **Spolehlivost:** vysoká. Jde o oficiální agregaci zdrojových registrů, ale se zpožděním proti zdroji (ARES vrací `datumAktualizace`).

### 3.2 Registr plátců DPH – webová služba Finanční správy

- **Dokumentace:** https://financnisprava.gov.cz/cs/dane/dane-elektronicky/danovy-portal/registr-dph
  - Cituji: „Webová služba je určena výhradně pro vzdálený přístup ze SW třetích stran.“
- **Technické parametry a podmínky (oficiální, přečteno 13. 10. 2026):** https://adisspr.mfcr.cz/pmd/dokumentace/webove-sluzby-spolehlivost-platcu
- **Oficiální endpoint (podle této dokumentace):** `https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP`
  - „Uvedená URL adresa slouží výhradně pro vzdálený přístup ke službě, ze SW třetích stran!“
  - Živě odpovídají i `adisrws.mfcr.cz/adistc/...` a `mojedane.gov.cz/dpr/...` (stejná odpověď), ale **relay použije výhradně dokumentovanou adresu `/dpr/`**.
- **WSDL:** https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP?wsdl
- **Poskytuje (ověřeno živě):** operace `getStatusNespolehlivySubjektRozsirenyV2`, vstup DIČ bez prefixu (`\d{1,10}`).
  - `statusSubjektu/@typSubjektu` = `PLATCE_DPH | IDENTIFIKOVANA_OSOBA | NESPOLEHLIVA_OSOBA | SKUPINA_DPH | NENALEZEN`
  - `@nespolehlivyPlatce` = `ANO | NE | NENALEZEN`, `@cisloFu`
  - `zverejneneUcty` (tuzemský účet: předčíslí/číslo/kód banky, nebo IBAN; `datumZverejneni`)
  - `status/@odpovedGenerovana` (datum)
  - Příklady: Alza.cz → `PLATCE_DPH`, `NE`, účty; neplátce 01432087 → `NENALEZEN`.
- **Technický přístup:** SOAP 1.1 přes HTTPS, bez autentizace.
- **Minimální request (ověřeno živě):**
  ```xml
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>
    <StatusNespolehlivySubjektRozsirenyV2Request xmlns="http://adis.mfcr.cz/rozhraniCRPDPH/"><dic>27082440</dic></StatusNespolehlivySubjektRozsirenyV2Request>
  </soapenv:Body></soapenv:Envelope>
  ```
  Hlavičky `Content-Type: text/xml; charset=utf-8`, `SOAPAction: ""`. DIČ bez prefixu „CZ“. Vstupem je DIČ, ne IČO; DIČ bereme z ARES (`dic`).
- **Ověřené odpovědi (13. 10. 2026; jména a adresy zde vynechány):**
  - plátce DPH + zveřejněné účty (27082440):
    `<status odpovedGenerovana="2026-10-13" statusCode="0" statusText="OK"/>`
    `<statusSubjektu typSubjektu="PLATCE_DPH" dic="27082440" nespolehlivyPlatce="NE" cisloFu="13"><zverejneneUcty><ucet datumZverejneni="…"><standardniUcet predcisli="…" cislo="…" kodBanky="…"/></ucet>…</zverejneneUcty><nazevSubjektu>…</nazevSubjektu><adresa>…</adresa></statusSubjektu>`
  - nespolehlivý plátce (00121100):
    `<statusSubjektu typSubjektu="PLATCE_DPH" dic="00121100" nespolehlivyPlatce="ANO" datumZverejneniNespolehlivosti="2017-03-16" cisloFu="456"><zverejneneUcty>…</zverejneneUcty><nazevSubjektu>…</nazevSubjektu><adresa>…</adresa></statusSubjektu>`
  - nespolehlivá osoba (01988468):
    `<statusSubjektu typSubjektu="NESPOLEHLIVA_OSOBA" dic="01988468" nespolehlivyPlatce="ANO" datumZverejneniNespolehlivosti="2019-02-21" cisloFu="461"><nazevSubjektu>…</nazevSubjektu><adresa>…</adresa></statusSubjektu>` (bez účtů)
  - neplátce (01432087): `typSubjektu="NENALEZEN"`, `nespolehlivyPlatce="NENALEZEN"`.
  - **Pozor:** nespolehlivá osoba má také `nespolehlivyPlatce="ANO"`; rozhodující je `typSubjektu` (viz F06/F07).
  - Zahraniční účet je `<nestandardniUcet cislo="IBAN"/>`.
- **Síťové chování (ověřeno):** HTTP 200 bez redirectu, `text/xml;charset=utf-8`, ~2,6 kB pro jedno DIČ, odezva 0,9–2,7 s. Server nastavuje cookies (`GwToken`, `TS…`) a HSTS; relay cookies ignoruje (neukládá ani nepřeposílá), `redirect:'error'` je kompatibilní. Dokumentace uvádí DNS balancování: volající musí vždy použít DNS dotaz a respektovat TTL, tj. **žádná pevná IP** v relay ani ve firewallu – hostname konstanta v kódu, rozlišení systémovým resolverem při každém novém spojení.
- **Podmínky služby (citace z oficiální dokumentace):** GFŘ si vyhrazuje omezit přístup uživatelům (podle IP), kteří odešlou **více než 10 000 požadavků za 24 h**, **více než 2 000 za 1 h**, **více než 4 paralelně**, porušují bezpečnost, používají službu jinak než podle dokumentace, opakovaně posílají nesprávné nebo **stejné** požadavky, obcházejí limity z více IP nebo automatizovaně propátrávají databázi náhodnými údaji.
- **statusCode:** 0 OK; 1 více než 100 DIČ (u nás nenastane); **2 technologická odstávka denně 0:00–0:10**; **3 služba nedostupná**. Plánovaná údržba **každou neděli 3:00–4:00**.
- **Právní základ zveřejnění:** § 106a (nespolehlivý plátce) a § 106aa (nespolehlivá osoba) zákona č. 235/2004 Sb.
- **Omezení a rozhodnutí pro MVP:**
  - posíláme vždy **jedno** DIČ na volání;
  - kontrolu provádíme **jen pro DIČ ve tvaru CZ + 8 číslic** (právnické osoby). DIČ fyzických osob (9–10 číslic, odvozené z rodného čísla) se do relay neposílá ani nezobrazuje; UI: „U fyzických osob kontrolu DPH neprovádíme.“;
  - `nazevSubjektu` a `adresa` z odpovědi relay zahodí (máme je z ARES; adresa FO by porušila minimalizaci);
  - text „NE = plátce DPH je spolehlivý“ z dokumentace **nepřebíráme**; v UI vždy „Není veden jako nespolehlivý plátce DPH.“
- **Spolehlivost:**
  - Vysoká pro „je/není veden jako nespolehlivý“.
  - `NENALEZEN` znamená pouze, že subjekt **není registrován k DPH**. Není to negativní ani pozitivní hodnocení.

### 3.3 Insolvenční rejstřík (ISIR, Ministerstvo spravedlnosti)

- **Dokumentace veřejné WS:** https://isir.justice.cz/isir/help/Popis_WS.pdf (v1.9)
- **Číselník událostí:** https://isir.justice.cz/isir/help/Cis_udalosti.xls
- **Zjištění:**
  - `IsirPub001` (`https://isir.justice.cz:8443/isir_ws/services/IsirPub001`) je **proud událostí** podle ID nebo data. Neumožňuje dotaz podle IČO, takže pro jednorázový lookup je nepoužitelný bez lokální repliky celého rejstříku.
  - `isir_cuzk_ws` (dotaz podle IČ/RČ) existuje podle knihoven třetích stran. **Oficiální dokumentaci ani podmínky veřejného použití jsem nenašel** a port 8443 nebyl z prostředí researche dosažitelný.
  - **eISIR** (https://eisir.justice.cz, pilot nové verze) volá interní endpointy svého frontendu (`/rizeni/vyhledatDleDluznika`, `/vypisy/generovatVypisDleDluznika`), ověřeno v bundlu. Nejsou dokumentované jako veřejné API, takže by šlo o scraping.
  - HTML lustrace `isir.justice.cz/isir/ueu/vysledek_lustrace.do?ic=…` se dá použít jako **odkaz pro uživatele**, ne pro strojové čtení.
- **MVP řešení:** insolvenční signály z ARES (VR `insolvence[]`, `konkursy[]`, `seznamRegistraci.stavZdrojeIr`).
  - Ověřeno na vzorku firem v likvidaci: `stavZdrojeIr = AKTIVNI` se objevuje i tam, kde jsou insolvenční zápisy ve VR už **vymazané** (např. 04147464: řízení zahájeno 22. 7. 2024, zápis vymazán 28. 8. 2024).
  - `stavZdrojeIr` proto znamená „subjekt má záznam v ISIR“ (i historický). Neznamená „probíhá insolvence“.
- **Spolehlivost:** střední. ARES přebírá data se zpožděním a u subjektů mimo VR (např. OSVČ) může insolvenční detail chybět. Proto vždy odkaz „Ověřte přímo v insolvenčním rejstříku“.

### 3.4 Obchodní rejstřík / Sbírka listin (Justice.cz)

- **Veřejný rejstřík:** https://or.justice.cz/ias/ui/rejstrik
- **Open data OR:** https://dataor.justice.cz/
  - Licence ověřena na webu: „Není-li uvedeno jinak, je … obsah … licencován pod licencí CC BY 4.0.“
  - Jde o hromadné roční dumpy CSV/XML po rejstřících a soudech, žádné dotazovací API.
- **MVP:**
  - Všechna strukturovaná data VR bereme z ARES VR, který je oficiální zrcadlo stejného rejstříku.
  - Sbírku listin a účetní závěrky **jen odkazem** na výpis subjektu.
  - Žádný scraping HTML or.justice.cz.
- **V2:** z dumpu OR (CC BY 4.0) lze offline předpočítat „poslední založená účetní závěrka (rok)“. Vyžaduje ověření, že dump obsahuje Sbírku listin (kap. 15).

### 3.5 Evidence skutečných majitelů (ESM)

- **Stav:** https://esm.justice.cz/ias/issm/rejstrik
  - Ověřeno: „Ministerstvo spravedlnosti dne 17. prosince 2025 znepřístupnilo evidenci skutečných majitelů veřejnosti.“
- **Rozhodnutí:** mimo MVP i V2, dokud se veřejný přístup nezmění. V UI ji nezmiňujeme.

### 3.6 ČNB – registr regulovaných subjektů (JERRS) – kandidát V2

- **Dokumentace:**
  - https://www.cnb.cz/cs/dohled-financni-trh/seznamy/webove-sluzby-ws-jerrs/
  - Popis WS: https://www.cnb.cz/export/sites/cnb/cs/dohled-financni-trh/.galleries/seznamy/webove_sluzby/Popis_WSJERRS.pdf
  - WSDL `JerrsWS.wsdl`, endpoint `https://aplc.cnb.cz/jerrsws/ws`, operace `getSubjekt` (dotaz podle IČO), `getSubjekty`, `getZastoupeny`.
- **Otevřená data:** https://www.cnb.cz/cs/dohled-financni-trh/seznamy/Otevrena-data/ (JSON: banky, npsu, szsu, vzsu, zvsu, zzsu, směnárny).
- **Hodnota:** u firmy, která nabízí investice, úvěry nebo platby, je zásadní, zda má oprávnění ČNB.
- **Stav:** endpoint WS byl z prostředí researche nedosažitelný (connection reset). Podmínky použití jsem nedohledal, takže je řadím do V2.

### 3.7 ČOI – seznam rizikových e-shopů

- Už integrováno ve Web Checkeru (synchronizace 1 283 domén).
- V modulu Firma se použije jen při přechodu z „Prověřit web“, kde je doména známá. **Žádné párování firmy na doménu podle názvu.**

### 3.8 Veřejné zmínky a recenze

- Žádný scraping.
- Bez prověřeného legálního API, které by vracelo strukturované zmínky o české firmě zdarma a s licencí pro zobrazení, nic neintegrujeme. Proto jen **externí odkazy na vyhledávání** (stejný vzor jako Web Checker), např. vyhledávač s dotazem `"<název>" <IČO>`.
- Odkazy se otevírají v novém okně a v UI jsou jasně označeny jako „mimo naše ověření“.

---

## 4. DATA MODEL

Výstup aplikace → klient (pouze minimalizovaná data):

```
FirmProfile {
  query:        { ico: "########" }               // nikdy název, nikdy URL
  checkedAt:    ISO datetime (server)
  identity: {
    ico, name, legalForm (text z číselníku), seat (textovaAdresa),
    founded (date|null), dissolved (date|null), dic (string|null),
    nace: [ { code, text } ] (max 3),
    source: "ARES", sourceUpdated: date|null
  } | null
  register: {                                     // VR, jen pokud existuje
    fileNo, capital?: { amount, currency },
    state: "AKTIVNI" | "VYMAZAN",
    deletedOn?: date, deletionReason?: text,
    liquidation: { active: bool, since?: date },
    statutory: [ { role, name, since: date } ],   // jen aktuální členové
    statutoryChanges12m: number,                   // počet zápisů+výmazů za 12 měsíců
    owners: [ { name, share?: text, since: date } ], // jen aktuální; FO jen jméno
    insolvency: {
      entries: [ { recordedOn, deletedOn|null, typeCode, typeText, text } ],
      bankruptcy: [ … stejný tvar … ]
    }
  } | { status: "NEOVĚŘENO" } | { status: "NENÍ_V_REJSTŘÍKU" }
  employees: { code, label } | null               // null = skrýt
  vat: {
    status: "PLATCE_DPH" | "IDENTIFIKOVANA_OSOBA" | "NESPOLEHLIVA_OSOBA" | "SKUPINA_DPH" | "NENALEZEN",
    unreliable: "ANO" | "NE" | "NENALEZEN",
    publishedAccounts: [ { display, publishedOn } ],
    generatedOn: date
  } | { status: "NEOVĚŘENO" } | { status: "BEZ_DIČ" }
  isirFlag: "AKTIVNI" | "NEEXISTUJICI" | other | null  // z ARES seznamRegistraci
  checks: [ { id, source, ran: bool, at } ]       // pro sekci „Co jsme ověřili“
  findings: [ { ruleId, severity: "INFO"|"ATTENTION"|"SERIOUS", text, source, sourceDate, action } ]
  verdict: "NO_MAJOR_SIGNALS" | "ATTENTION" | "SERIOUS" | "INCOMPLETE"
  manualLinks: [ { label, url } ]                 // statické šablony
}
```

**Co se nikdy neposílá ani neukládá:**
- `datumNarozeni`, adresa fyzické osoby, rodné číslo;
- historičtí statutáři (jen počet změn);
- surová odpověď registru;
- uživatelem zadaný účet (porovnání proběhne a hodnota se zahodí).

Logy obsahují jen IČO, ID pravidel a stav adaptéru. **Žádná jména.**

---

## 5. REGISTRY ADAPTER ARCHITECTURE

```
prohlížeč ──POST /api/firm {ico}──► verimtomu-web (172.30.41.2, bez egress)
                                         │ Bearer, pevná URL
                                         ▼
                        verimtomu-ai-proxy (172.30.41.3:8080) – „registry relay“
                          ├─ POST /v1/registry/ares          (stávající, beze změny)
                          ├─ POST /v1/registry/ares-profile  {ico}   → 3 pevné GET na ARES
                          ├─ POST /v1/registry/ares-search   {name}  → 1 pevný POST na ARES
                          └─ POST /v1/registry/dph           {dic}   → 1 pevný SOAP na MF
                                         ▼
                        ares.gov.cz / adisrws.mfcr.cz (whitelist hostů v kódu)
```

**Proč takto:**
- Rozšiřuje se stávající relay, žádná druhá ARES integrace a žádná změna firewallu.
- Web dál nemá egress a DOCKER-USER pravidlo `.2 → .3:8080` zůstává.
- Relay už má internet (ARES ověřen z VPS).
- **Nutné ověřit před nasazením:** dosažitelnost `adisrws.mfcr.cz:443` z `verimtomu-ai-egress`.

**Společný kontrakt adaptéru:**

| Vlastnost | ares-profile | ares-search | dph |
|---|---|---|---|
| Vstup (přesně) | `{"ico":"########"}` + checksum, ≤64 B | `{"name":"…"}` 3–100 znaků, bez řídicích znaků, ≤256 B | `{"dic":"\d{8}"}` (jen právnické osoby), ≤64 B |
| Upstream | `GET …/ekonomicke-subjekty/{ico}`, `…-vr/{ico}`, `…-res/{ico}` | `POST …/ekonomicke-subjekty/vyhledat` `{obchodniJmeno,start:0,pocet:10}` | `POST https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP` (pevný SOAP envelope, DIČ vložené po validaci) |
| Host/path | konstanta v kódu, žádná část z klienta kromě validovaného IČO | konstanta | konstanta |
| `redirect` | `error` | `error` | `error` |
| Timeout | 3,5 s na volání, 3 volání paralelně; celkem < 4 s | 3,5 s | 3,5 s (naměřeno 0,9–2,7 s; ověřit na VPS) |
| Max velikost | 128 kB základ, 512 kB VR, 64 kB RES | 256 kB | 64 kB |
| Content-Type | `application/json` | `application/json` | `text/xml` |
| Validace | `ico` v odpovědi == dotaz; schéma; VR `primarniZaznam` | každý kandidát IČO + checksum; max 10 | XML bez DTD/entit (odmítnout `<!DOCTYPE`); `statusCode="0"`; právě jeden `statusSubjektu` s `dic` == dotaz; `typSubjektu` a `nespolehlivyPlatce` z výčtu |
| Výstup | whitelist polí z kap. 4, **minimalizace už v relay** (FO bez data narození a adresy) | `[{ico,name,seat}]`, `total` nebo `TOO_MANY` | `{typSubjektu, nespolehlivyPlatce, datumZverejneniNespolehlivosti?, ucty[], generatedOn}`; bez `nazevSubjektu` a `adresa` |
| Rate limit (relay) | 20 profilů/min (jeden profil = 3 upstream volání); ARES limit 500/min | 10/min | 10/min **a** 500/h **a** 4 000/24 h (pod limity GFŘ 2 000/h a 10 000/24 h; počítá se po validaci) |
| Souběh | 2 | 2 | 2 |
| Chyba | 502 → aplikace `NEOVĚŘENO` | 502 → „Vyhledávání je teď nedostupné, zadejte IČO“ | 502 → DPH `NEOVĚŘENO` |

**Částečný výsledek:**
- Když ARES základ projde, ale VR nebo RES selže, profil se vrátí s `register: {status:"NEOVĚŘENO"}`.
- Verdikt pak nesmí být 🟢 (viz kap. 7).

**Aplikace (`verimtomu-web`):**
- `/api/firm` a `/api/firm-search` jen přes stávající Origin/session kontroly, `AdmissionGate` a limiter.
- Cache v paměti 10 minut pro IČO, aby se při opakování nezatěžovaly registry. Cache je pouze pro data registru, nikdy pro uživatelské vstupy.
- Pravidla (kap. 6) běží v aplikaci nad minimalizovanými daty z relay.

---

## 6. DETERMINISTIC RULES

Úrovně: **SERIOUS** (🔴), **ATTENTION** (🟠), **INFO** (jen kontext, neovlivní barvu).

| ID | Zdroj | Podmínka | Závažnost | Text pro uživatele | Falešné pozitivy / poznámka |
|---|---|---|---|---|---|
| F01 | ARES | `datumZaniku` vyplněno nebo VR `stavSubjektu` ≠ AKTIVNI / `datumVymazu` | SERIOUS | „Podle ARES subjekt zanikl {datum}. Pokud po vás někdo pod tímto IČO chce peníze, ověřte, s kým skutečně jednáte.“ | Nástupnická firma po fúzi – zobrazit `pravniDuvodVymazu`, pokud je k dispozici |
| F02 | ARES VR | aktuální člen orgánu `typOrganu = LIKVIDATOR` nebo aktivní zápis o zrušení s likvidací | SERIOUS | „Firma je v likvidaci (od {datum}). Firma v likvidaci by neměla uzavírat nové obchody nad rámec likvidace. Neposílejte zálohy, dokud si to neověříte.“ | Dobrovolná likvidace zdravé firmy – text proto nehovoří o podvodu |
| F03 | ARES VR | existuje insolvenční nebo konkurzní zápis bez `datumVymazu` | SERIOUS | „Ve veřejném rejstříku je zapsán insolvenční zápis: „{text zkráceně}“. Před platbou si stav ověřte v insolvenčním rejstříku.“ + odkaz | Neopodstatněný věřitelský návrh – proto citujeme zápis a odkazujeme do ISIR, sami nehodnotíme |
| F04 | ARES VR | insolvenční zápis jen s `datumVymazu` (historický) | ATTENTION | „V minulosti byl u firmy zapsán insolvenční zápis ({rok}). Nyní už ve veřejném rejstříku není aktivní.“ | Zamítnutý šikanózní návrh |
| F05 | ARES | `seznamRegistraci.stavZdrojeIr = AKTIVNI` a zároveň F03 ani F04 neplatí (např. subjekt mimo VR) | ATTENTION | „ARES uvádí, že subjekt má záznam v insolvenčním rejstříku. Podrobnosti ověřte přímo v ISIR.“ | Historické řízení; neříkáme „probíhá insolvence“ |
| F06 | DPH | `nespolehlivyPlatce = ANO` **a** `typSubjektu ≠ NESPOLEHLIVA_OSOBA` | SERIOUS | „Finanční správa vede tento subjekt jako nespolehlivého plátce DPH (stav k {datum}). Při platbě takovému plátci můžete za jeho DPH ručit.“ | Status se zveřejňuje až po právní moci, takže FP jsou nízké |
| F07 | DPH | `typSubjektu = NESPOLEHLIVA_OSOBA` (má přednost před F06, nezobrazovat oba) | SERIOUS | „Finanční správa vede tento subjekt jako nespolehlivou osobu (zveřejněno {datumZverejneniNespolehlivosti}, stav k {datum}).“ | – |
| F08 | DPH + vstup | uživatel zadal účet; subjekt je plátce DPH; účet **není** mezi zveřejněnými | ATTENTION | „Číslo účtu, které jste zadali, není mezi účty, které tento plátce zveřejnil ve Registru DPH. Ověřte číslo účtu jiným kanálem, než kterým jste ho dostali.“ | Firma platby přijímá přes platební bránu nebo factoring; spotřebitelské platby na nezveřejněný účet jsou legální |
| F09 | ARES | `datumVzniku` < 6 měsíců | ATTENTION | „Firma vznikla teprve {datum}. Nová firma nemusí být problém, ale při velké záloze buďte opatrní.“ | Většina nových firem je v pořádku |
| F10 | ARES VR | ≥ 2 změny statutárního orgánu za posledních 12 měsíců nebo změna statutáře v posledních 90 dnech | ATTENTION | „Ve vedení firmy proběhly nedávné změny ({počet} za 12 měsíců).“ | Běžná obměna ve velkých a. s. – u akciových společností s ≥ 5 členy orgánu práh ×2 |
| F11 | ARES VR | změna společníka (100 %) a statutáře v rozmezí 90 dnů | ATTENTION | „Firma nedávno změnila vlastníka i vedení.“ | Legitimní prodej ready-made firmy |
| F12 | ARES | IČO existuje, ale `stavZdrojeVr` = NEEXISTUJICI a právní forma je s. r. o./a. s. | ATTENTION | „Firmu jsme nenašli ve veřejném rejstříku, ačkoli by tam podle právní formy měla být.“ | Čerstvý zápis se zpožděním ARES |
| F13 | — (kontext) | sídlo na adrese s mnoha firmami / virtuální sídlo | **INFO, neimplementovat jako varování** | (V MVP se nezobrazuje.) | Virtuální sídlo je legální a běžné. **Nikdy není signálem podvodu.** |
| F14 | DPH | `typSubjektu = NENALEZEN` | INFO | „Subjekt není registrován jako plátce DPH. To samo o sobě nic špatného neznamená.“ | – |
| F15 | ARES | základní kapitál < 1 000 Kč | INFO | „Základní kapitál je {x} Kč (zákonné minimum je 1 Kč).“ | Běžné; jen kontext |
| F16 | Prověřit web | doména z Web Checkeru je na seznamu rizikových e-shopů ČOI a uživatel přišel odtud | SERIOUS | (přebírá text Web Checkeru) | Platí jen pro tuto doménu, ne pro firmu obecně |

**Žádné pravidlo nezní** „firma je podvodná“, „firma je bezpečná“ ani „spolehlivý plátce“. Absence nálezu se nikdy nepřevádí na pozitivní tvrzení.

---

## 7. VERDICT MODEL

```
if any adapter for identity failed            → INCOMPLETE  („Ověření se nepodařilo dokončit“)
elif any SERIOUS                               → 🔴 Našli jsme závažné varovné signály
elif any ATTENTION or VR/DPH NEOVĚŘENO         → 🟠 Stojí za pozornost
else                                           → 🟢 Nenašli jsme výrazné varovné signály
```

- 🟢 vždy doplňuje věta: „To neznamená, že je firma bezpečná. Ověřili jsme jen zdroje uvedené níže, ke dni {datum}.“
- Žádná čísla, procenta ani skóre. Počty nálezů ano („2 věci stojí za pozornost“).
- NEOVĚŘENO u kteréhokoli MVP zdroje znamená, že výsledek nesmí být 🟢. Nezkontrolovaný zdroj neznamená „bez nálezu“.
- **AI (volitelné):** dostane jen `findings[]` a `identity.name` a vrátí 2–3 věty shrnutí. Výstup se validuje:
  - nesmí obsahovat slova ze zakázaného seznamu (bezpečn, důvěryhodn, podvod, doporučujeme, spolehliv…);
  - nesmí měnit barvu.
  - Při selhání nebo vypnutí AI se shrnutí nezobrazí a zbytek funguje beze změny.
  - Žádný název poskytovatele ani modelu v UI.

---

## 8. UX FLOW

**Vstup:** jedno pole „IČO nebo název firmy“ a volitelné „Číslo účtu, na které máte platit“.

1. **IČO (8 číslic, checksum OK)** → rovnou profil.
2. **Text** → `/api/firm-search`:
   - 1–10 kandidátů: seznam „Název · IČO · sídlo“. Uživatel klikne → profil podle IČO. **Nikdy automatický výběr, ani při jediném kandidátovi.** Kandidát se jen předvybere a vyžaduje potvrzení.
   - > 10: „Našli jsme {n} firem. Upřesněte název nebo zadejte IČO.“
   - `TOO_MANY`: „Název je příliš obecný. Zadejte celé jméno firmy nebo IČO.“
   - 0: „Pod tímto názvem jsme v ARES nic nenašli. Zkontrolujte překlep nebo zadejte IČO.“

**Výsledek (pořadí):**
1. **Verdikt + akce nejdřív.** Příklad 🔴: „Než zaplatíte: 1) neplaťte zálohu, 2) ověřte stav v insolvenčním rejstříku (odkaz).“
2. **Kdo to je:** název, IČO, právní forma, sídlo, vznik, DIČ, obor, zaměstnanci (jen pokud kód ≠ 000), statutáři „Jméno Příjmení – jednatel, od 2019“, vlastníci (aktuální).
3. **Co jsme zjistili:** nálezy podle závažnosti. Každý má zdroj a datum.
4. **Co jsme ověřili:** checklist, kde ✓ znamená, že kontrola proběhla, ne že dopadla dobře:
   - ✓ ARES – základní údaje (k {datum})
   - ✓ Veřejný rejstřík (přes ARES) / ⚠ Neověřeno – zdroj nedostupný
   - ✓ Registr DPH – „Není veden jako nespolehlivý plátce DPH.“ (stav k {datum})
   - ✓ Insolvenční záznamy v ARES – „Nalezen insolvenční záznam“ / „Nenalezen záznam v prověřených datech“
   - ○ Neověřujeme: skutečné majitele (evidence je veřejnosti nepřístupná), recenze, soudní spory
5. **Ověřte sami:** odkazy na ISIR lustraci, výpis a Sbírku listin na or.justice.cz, vyhledávač zmínek.
6. **Tři oddělené bloky:** OFICIÁLNÍ DATA (vše výše) / VEŘEJNÉ ZMÍNKY (jen odkazy) / UŽIVATELSKÉ RECENZE (jen odkazy, s upozorněním, že recenze lze zfalšovat).

**Propojení s „Prověřit web“:**
- Web → Firma: když uživatel ve Web Checkeru zadá IČO z obchodních podmínek, nabídne se „Prověřit tuto firmu podrobně“. Předává se jen IČO.
  - Text: „IČO jste zadali vy z webu; nespojení webu s firmou jsme neověřovali.“
- Firma → Web: tlačítko „Prověřit i web, kde nakupujete“ otevře Web Checker s prázdným polem. **Žádný návrh domény podle názvu.**

---

## 9. PRIVACY

- Minimalizace probíhá **v relay** (data narození a adresy FO z relay vůbec neodcházejí). Aplikace je kontroluje znovu podle whitelistu.
- Statutáři a společníci FO: pouze jméno, příjmení, funkce a datum od. Zahraniční FO stejně.
- Historické osoby se nezobrazují, ukazuje se jen počet změn.
- Uživatelem zadaný název, IČO a účet se neukládají. Logy mají jen IČO, stav adaptéru a ID pravidel, max 30 dní.
- Cache 10 min v paměti, bez persistence.
- OSVČ (FO podnikatel):
  - zobrazit jen to, co ARES vrací ve veřejném základním záznamu (jméno = obchodní firma, sídlo podnikání);
  - nevolat VR;
  - upozornit, že sídlo podnikání může být bydliště, a **adresu u OSVČ zobrazit jen na úrovni obce**.
- Zásady ochrany osobních údajů doplnit o: účel (ochrana uživatele před podvodem), právní základ (oprávněný zájem, veřejné registry), zdroje, dobu uchování.

---

## 10. FAILURE STATES

| Stav | Chování |
|---|---|
| Neplatné IČO (checksum) | nevolat nic; „Toto IČO nemá platný tvar. Zkontrolujte ho.“ |
| ARES 404 | „Subjekt s tímto IČO jsme v ARES nenašli.“ + ATTENTION, pokud uživatel přišel s žádostí o platbu |
| ARES základ selže | INCOMPLETE, žádná barva, „Zkuste to za chvíli“ |
| VR / RES selže | sekce NEOVĚŘENO, verdikt max 🟠 |
| DPH selže | DPH NEOVĚŘENO, verdikt max 🟠 |
| DPH `statusCode` 2 (denně 0:00–0:10) nebo 3, nedělní údržba 3:00–4:00 | DPH NEOVĚŘENO: „Registr DPH má právě plánovanou odstávku. Zkuste to prosím později.“; verdikt max 🟠 |
| DIČ fyzické osoby (9–10 číslic) | DPH se nevolá: „U fyzických osob kontrolu DPH neprovádíme.“; neovlivní barvu |
| Firma bez DIČ | DPH řádek „Firma nemá DIČ – kontrola DPH se neprovedla.“ |
| Rate limit (naše 429) | „Mnoho dotazů, zkuste to za minutu.“ |
| Vyhledávání > 1000 | `TOO_MANY` UX |
| Neočekávané schéma | fail-closed → NEOVĚŘENO pro daný zdroj, log ID adaptéru |
| Nekonzistence (IČO v odpovědi ≠ dotaz) | NEOVĚŘENO, alert v logu |

---

## 11. SECURITY / SSRF MODEL

- Klient posílá jen `ico`, `name`, `dic` a volitelně `account`. **Žádná URL, host ani cesta.** Neznámé klíče → 400 (jako stávající relay).
- Relay skládá URL jen z konstant a validovaného IČO (8 číslic) nebo DIČ (8–10 číslic). Název jde jen do JSON těla, nikdy do URL.
- `redirect: 'error'`, pevný host v kódu, kontrola `response.url` hostu.
- SOAP:
  - envelope je šablona; DIČ se vkládá až po regex validaci;
  - odpověď se parsuje parserem bez DTD a entit;
  - odpověď s `<!DOCTYPE` / `<!ENTITY` je odmítnuta;
  - limit 64 kB.
- Limity velikosti se vynucují čtením streamu s průběžným počítáním, ne podle `Content-Length`.
- Bearer auth relay beze změny. Nové routy nejsou dostupné na AI cestách a naopak (testem).
- Firewall, Docker sítě a Cloudflare beze změny. Před nasazením ověřit egress z relay na `adisrws.mfcr.cz`.
- Žádný obecný proxy endpoint. Každá route má pevné jméno a pevný upstream.
- Výstup do HTML jen přes textContent (texty zápisů z VR jsou cizí text).
- Abuse:
  - limit na session i na IP;
  - vyhledávání podle názvu má přísnější limit;
  - žádné hromadné dotazy (jedno IČO na požadavek).

---

## 12. TEST PLAN

- **Relay (izolovaný fake upstream, stejný vzor jako `tests/ares-relay.test.js`):**
  - pevné URL pro každou route;
  - injekce do IČO, DIČ a názvu (`../`, URL, `?`, `#`, unicode, řídicí znaky) → 400 bez upstream volání;
  - extra klíče → 400;
  - redirect, oversize, špatný Content-Type, nesoulad IČO/DIČ, timeout → 502;
  - XXE payload v SOAP odpovědi → 502;
  - souběh 2 a limity za minutu;
  - AI routy beze změny.
- **Minimalizace:** VR fixture s `datumNarozeni` a `adresa` u FO → v relay výstupu i v API odpovědi chybí (kontrola hlubokým průchodem objektu).
- **Pravidla (unit, fixture):**
  - zaniklý subjekt; likvidace (fixture podle 02032945);
  - aktivní insolvenční zápis; historický zápis (podle 04147464);
  - `stavZdrojeIr` bez VR;
  - nespolehlivý plátce; nespolehlivá osoba;
  - účet mezi zveřejněnými účty / mimo ně / bez zadaného účtu / neplátce;
  - nová firma; změny statutářů;
  - OSVČ bez VR.
- **Verdikt:** každá kombinace NEOVĚŘENO → nikdy 🟢. Zakázaná slova v celém UI a fixtures (bezpečn, důvěryhodn, spolehlivý plátce, doporučujeme, skóre a čísla /100).
- **UX (Playwright, 375 px):**
  - název → kandidáti → výběr → profil;
  - jediný kandidát není automaticky otevřen;
  - výpadek relay → NEOVĚŘENO;
  - žádné externí requesty z prohlížeče kromě kliknutých odkazů;
  - na server jde jen IČO a název.
- **AI vypnuté:** celý flow funguje. AI s výstupem obsahujícím zakázané slovo → shrnutí se nezobrazí.
- **Živý smoke (ručně, mimo CI):** 27082440 (Alza) a 02032945 (likvidace), plus neplátce 01432087.

---

## 13. V2

1. **ČNB JERRS `getSubjekt` podle IČO.** Pravidlo: firma nabízí investice nebo úvěr a není v registru ČNB. Vyžaduje ověřit dostupnost a podmínky a přidat egress na `aplc.cnb.cz`.
2. **OR open data (CC BY 4.0):** noční offline import „rok poslední založené účetní závěrky“ → pravidlo „Firma nezaložila účetní závěrku za posledních 2 roky“ (ATTENTION; ve Sbírce listin je to zákonná povinnost).
3. **Přímé ISIR podle IČO,** jakmile MS zveřejní oficiální rozhraní (eISIR) s podmínkami.
4. **ARES RŽP** pro OSVČ (živnostenská oprávnění a jejich přerušení).
5. **Monitoring** (ARES `notifikace`) – jen pokud by vznikla služba „hlídat firmu“. Vyžaduje souhlas a uložení IČO.

---

## 14. NOT RECOMMENDED

- Scraping eISIR, ISIR HTML lustrace, or.justice.cz nebo Google – křehké a mimo dokumentované rozhraní.
- Replikace celého ISIR přes `IsirPub001` jen kvůli MVP – neúměrná složitost a data o FO.
- ESM – veřejně nepřístupná.
- Placené agregátory (např. komerční „scoring“ firem) – existuje veřejná alternativa a jejich skóre odporuje pravidlu „žádné skóre“.
- Virtuální sídlo, nízký kapitál nebo „hromadné sídlo“ jako varovný signál.
- Párování firmy na doménu podle podobnosti názvu.
- Odhady zaměstnanců z LinkedIn apod.
- Zobrazení historických statutářů jménem, dat narození a adres.
- AI jako rozhodovatel nebo zdroj faktů.

---

## 15. IMPLEMENTATION PLAN PRO CODEX

**Předpoklad (jediný otevřený bod):** jednorázový test, že produkční `verimtomu-ai-proxy` dosáhne na oficiální DPH endpoint. Žádná změna firewallu, sítí ani image; jeden SOAP dotaz na veřejné DIČ firmy (Alza.cz a.s.). Druhý řádek kontroluje, že web kontejner na DPH **nedosáhne** (izolace beze změny).

```bash
docker exec verimtomu-ai-proxy node -e 'const u="https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH.rozhraniCRPDPHSOAP";const b="<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\"><soapenv:Body><StatusNespolehlivySubjektRozsirenyV2Request xmlns=\"http://adis.mfcr.cz/rozhraniCRPDPH/\"><dic>27082440</dic></StatusNespolehlivySubjektRozsirenyV2Request></soapenv:Body></soapenv:Envelope>";const t=Date.now();fetch(u,{method:"POST",redirect:"error",headers:{"Content-Type":"text/xml; charset=utf-8",SOAPAction:"\"\""},body:b,signal:AbortSignal.timeout(5000)}).then(async r=>{const x=await r.text();const s=(x.match(/<status [^>]*>/)||["?"])[0];const p=(x.match(/<statusSubjektu [^>]*>/)||["?"])[0];console.log("DPH from relay:",r.status,r.headers.get("content-type"),x.length+"B",(Date.now()-t)+"ms");console.log(s);console.log(p);process.exit(r.status===200&&/statusCode="0"/.test(s)&&/typSubjektu="PLATCE_DPH"/.test(p)?0:1)}).catch(e=>{console.log("DPH from relay FAILED:",e.name,e.cause?.code||e.message);process.exit(1)})' && echo "PASS relay → DPH" || echo "FAIL relay → DPH"
docker exec verimtomu-web node -e 'fetch("https://adisrws.mfcr.cz/",{signal:AbortSignal.timeout(5000)}).then(()=>{console.log("OPEN");process.exit(1)}).catch(()=>console.log("BLOCKED"))' && echo "PASS web → DPH BLOCKED" || echo "FAIL web has direct outbound"
```

Očekávaný výstup: `DPH from relay: 200 text/xml;charset=utf-8 …B …ms`, `statusCode="0"`, `typSubjektu="PLATCE_DPH" … nespolehlivyPlatce="NE"`, `PASS relay → DPH`, `BLOCKED`, `PASS web → DPH BLOCKED`. Pokud čas > 3 000 ms, zvýšit DPH timeout v relay není možné nad app rozpočet 4 s → DPH zůstane NEOVĚŘENO při pomalé odpovědi (fail-closed), což je přijatelné.

**Kroky (každý samostatný commit, testy první):**

1. **Relay `ai-proxy.cjs`:**
   - route `/v1/registry/ares-profile` (3 pevné GET, minimalizace, limity);
   - testy podle kap. 12;
   - stávající `/v1/registry/ares` beze změny.
2. **Relay:** `/v1/registry/ares-search` + testy.
3. **Relay:** `/v1/registry/dph` (pevný endpoint `/dpr/`, SOAP šablona, jen 8místné DIČ, XML bez DTD, ignorovat cookies, limity 10/min + 500/h + 4 000/24 h, souběh 2, statusCode 2/3 → 503 „odstávka“) + testy včetně XXE a odstávky.
4. **Aplikace:**
   - `src/firm-sources.js` (klient relay, NEOVĚŘENO fallback, 4s rozpočet) – sdílí validátor IČO z `eshop-sources.js`;
   - `src/firm-rules.js` (pravidla F01–F16 bez F13, verdikt) + fixtures (včetně ověřených tvarů DPH odpovědí z kap. 3.2).
5. **Server:**
   - `/api/firm`, `/api/firm-search` (Origin/session, AdmissionGate, limiter, cache 10 min);
   - test, že tělo obsahuje jen povolené klíče.
6. **UI:**
   - stránka `/proverit-firmu` v existujícím designu (žádný redesign);
   - výběr kandidáta;
   - sekce podle kap. 8, zdroj + datum u každého údaje, upozornění na informativní charakter ARES;
   - externí odkazy: ISIR lustrace, výpis a Sbírka listin na or.justice.cz, veřejné zmínky;
   - Playwright test.
7. **Propojení s Web Checkerem** (jen předání IČO) + text o neověřeném vztahu web↔firma.
8. Doplnit zásady ochrany osobních údajů.
9. Volitelné AI shrnutí za feature flagem, výchozí stav vypnuto, s filtrem zakázaných slov.
10. Release podle stávajícího runbooku. Firewall, Docker sítě a Cloudflare se nemění.

---

## READY FOR IMPLEMENTATION

- **DPH:** endpoint, request, odpovědi (plátce, nespolehlivý plátce, nespolehlivá osoba, zveřejněné účty, neplátce), síťové chování a podmínky jsou ověřené. Zbývá pouze jednorázový test dostupnosti z produkčního relay (příkaz výše).
- **ARES:** podmínky a limit (500 dotazů/min) ověřeny; attribution není povinná, upozornění v UI je definováno v 3.1.
- **Insolvence, ESM, Sbírka listin, ČNB:** uzavřeno rozhodnutím vlastníka (kap. 0).

**READY FOR IMPLEMENTATION: YES**, jakmile příkaz výše vrátí `PASS relay → DPH` a `PASS web → DPH BLOCKED`. Do té doby NO s tímto jediným blockerem.
