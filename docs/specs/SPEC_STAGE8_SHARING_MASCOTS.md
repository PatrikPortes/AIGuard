# Stage 8 – Sdílení výsledků a Věrka s Robem: inventura a specifikace (S8.1)

*Stav 2026-10-14: pouze S8.1 (inventura a návrh). Nic není implementováno. Soutěžní deadline 26. 10. 2026.*

- **Produkční baseline:** `6980bc5b384a4b2af3cd5a3c0f9b6247ba7e7430`. Ověřeno: HEAD `release/web-checker-2-2026-10-13` = Stage 7.
- **Stage 7.1 (úprava odkazů GrowMate):** na remote neexistuje žádná větev ani commit nad produkcí (`feat/stage7-trust` = produkce). Nic se nezačleňuje. Pokud vznikne, Stage 8 se na ni přebázuje až po jejím review.
- **Rozsah (rozhodnutí autora 2026-10-14):**
  1. bezpečné sdílení výsledků;
  2. Native Share API s funkčním fallbackem;
  3. inventura existujících ilustrací;
  4. revize a návrh chybějících nálad;
  5. integrace schválených **statických** ilustrací.
- **Animace jsou mimo Stage 8** a zapsané jako budoucí rozšíření (§7). Patří sem pohyb postav, pulzování, animované přechody karet i animace při sdílení nebo kopírování.
- **Technické hranice:** jen prohlížeč. Statický modul, CSS a texty. Žádné nové API, databáze, externí služba, cookie ani měření.

---

## 1. Inventura ilustrací

Zdroj pravdy je `public/character-assets.js` (generovaný katalog, SHA-256 v názvu souboru) a `docs/design/ASSETS.md` (schválení vlastníkem). Všechny WebP jsou bezeztrátové s průhledností a server je už nabízí.

| Asset | Co ukazuje | Současné použití | Použitelnost pro Stage 8 |
|---|---|---|---|
| `verka-welcome` | Věrka s otevřeným gestem „pojďte dál“ | **nepoužito** (homepage nyní používá `verkarob` srcset) | uvítání na stránkách checkerů |
| `verka-explaining` | Věrka s perem, vysvětluje | nadpis výsledku F5a, kombinovaný výsledek (`check-view`), `verdict-view`, smlouva | neutrální výsledek, „stojí za pozornost“ |
| `verka-thinking` | Věrka s tabletem, přemýšlí | **nepoužito** | „bez nalezených rizik“ (opatrně) i „nedokončeno“ |
| `verka-warning` | Věrka, gesto STOP + výstražný trojúhelník | jen chyba vstupu (`app.js`) | **vysoké riziko** |
| `verka-success` | Věrka slaví (pěst, mrknutí) | **nepoužito**; ASSETS.md: „nízké skóre nesmí samo aktivovat success“ | **nepoužívat u výsledků.** Nanejvýš potvrzení akce uživatele (např. „zkopírováno“), viz §6 |
| `robo-default` | Robo mává | hlavička signálů F5a, web, investice, půjčka, 404 | výchozí systémový pomocník |
| `robo-analyzing` | Robo s datovými panely | loading zprávy, půjčky, smlouvy | **probíhající kontrola** |
| `robo-searching` | Robo s lupou | **nepoužito** | probíhající dotaz do registrů (firma) |
| `robo-warning` | Robo, výstražný trojúhelník | **nepoužito** | doplněk u vysokého rizika (vedlejší role) |
| `robo-success` | Robo, zelený check | konec zpracování (zpráva, půjčka, smlouva) | jen „systém dokončil práci“. **Nikdy** u výsledku „bez rizik“ ani ve sdílení |
| `robo-tip` | Robo, žárovka | **nepoužito** | u bloku „Co udělat teď“ (tip, ne verdikt) |
| `robo-capacity` | Robo s baterií | chyba kapacity / limitu | beze změny |
| `robo-error` | Robo, červený křížek | technická chyba | beze změny; **ne** pro nedokončenou kontrolu z neutrálních důvodů |
| `verkarob` (+420/640/840) | Věrka s nápadem, Robo s otazníkem | homepage hero (srcset) | uvítání; beze změny |

### Chybějící nálady

| Nálada | Stav | Náhrada do dodání |
|---|---|---|
| Sdílení výsledku (Věrka „pošlu to blízkým“) | **chybí** | bez postavy, jen tlačítko a text. `verka-success` by mohla působit jako oslava výsledku. |
| Nedokončená / částečná kontrola (klidná, ne chyba) | **chybí** | `verka-thinking` (+ `robo-searching`, pokud chybí zdroj) |
| Opatrné „nic jsme nenašli, ale…“ | částečně (`verka-thinking`) | `verka-thinking` |
| `verka-default`, `verka-question`, `verka-thumbsup` | chybí podle ASSETS.md, pro Stage 8 nejsou nutné | — |

### Zadání pro nové ilustrace (jen návrh, bez schválení se nevytváří)

Stejná kresba, proporce, paleta a štít Věřím? jako u schválených stavů; průhledné PNG 1312×1199 (Věrka) nebo 1145×1374 (Robo); bez textu v obrázku.

1. **`verka-share`:** Věrka drží telefon, druhou rukou ukazuje k obrazovce, klidný přátelský výraz. Ne oslava, ne palec nahoru. Použití: sdílecí panel.
2. **`robo-incomplete`:** Robo s polovičním ukazatelem průběhu nebo s přesýpacími hodinami, neutrální výraz, bez červené a bez zelené. Použití: nedokončená nebo částečná kontrola.

Obě jsou volitelné. Stage 8 je bez nich úplná (viz náhrady).

---

## 2. Inventura výsledkových komponent

| Plocha | Stránky | Modul | Úroveň výsledku |
|---|---|---|---|
| Kombinovaný výsledek | Web (vždy), Investice (vždy), Zpráva a Půjčka (jen s IČO nebo odkazem), Smlouva (po výběru strany) | `check-view.js` `renderCombinedResult` | `aggregate.level`: `serious`, `attention`, `none_found`, `incomplete`, `not_assessable` (A1–A6, konzervativní) |
| Výsledek firmy | `/proverit-firmu` | `verdict-view.js` `renderVerdict` (z `firm.js`) | `CheckResult.level` (stejných 5 úrovní) |
| Výsledek F5a | Zpráva, Půjčka | `app.js` `render` | **bez úrovně, záměrně.** Prohlížeč z `risk_score` ani `risk_level` nic neodvozuje; zobrazuje se pořadí doporučených kroků ze serveru. |
| Výsledek smlouvy | Smlouva | `contract.js` `render` | bez úrovně; počet nálezů 0 / >0. `fromContract` umí dát `attention` nebo `not_assessable`. |
| Chyby | všechny | `app.js` `showError`, `contract.js`, `firm.js` | chyba = žádný výsledek ke sdílení |

**Pevné nadpisy úrovní** (`verdict-model.js` `HEADLINES`): „Našli jsme závažné varovné signály“, „Stojí za pozornost“, „Nenašli jsme výrazné varovné signály“, „Kontrolu se nepodařilo dokončit“, „Z dostupných údajů nelze posoudit“. Prošly `isSafeCopy`.

**Existující akce:** smlouva má „Zkopírovat otázky“ (`navigator.clipboard`) a „Vytisknout“. Jinde žádné sdílení ani kopírování není.

**Prostředí:**
- `Permissions-Policy` omezuje jen kameru, mikrofon a polohu, takže `navigator.share` i clipboard v zabezpečeném kontextu fungují bez změny serveru.
- CSP není pro sdílení potřeba měnit (žádné síťové volání).

---

## 3. Mapování na kategorie sdílení (S8.3)

| Úroveň | Kategorie sdílení |
|---|---|
| `serious` | 1. Vysoké riziko |
| `attention` | 2. Vyžaduje pozornost |
| `none_found` | 3. Bez nalezených rizik (nikdy „bezpečné“) |
| `incomplete`, `not_assessable` | 4. Nedokončená nebo částečná kontrola |
| F5a bez kombinovaného výsledku | **N. Neutrální** (bez kategorie, viz D1) |
| chyba nebo žádný výsledek | tlačítko se nezobrazí |

**Smlouva:** kategorie z `fromContract(result).level` (nálezy → 2, jinak 4 „nelze posoudit“). Nová logika se nepřidává.

**Kombinovaný výsledek má přednost:** pokud stránka zobrazuje kombinovaný výsledek, tlačítko sdílí jeho `aggregate.level`.

---

## 4. Návrh sdílení (S8.2)

### 4.1 Princip: text je funkce dvou výčtů

```
buildShareText(checkerType, category)  // obě hodnoty z pevného seznamu, nic jiného
```

- **`checkerType`** zadává stránka jako konstantu: `message`, `loan`, `contract`, `web`, `firm`, `investment`. Nikdy se neodvozuje z dat.
- **`category`** je jedna z hodnot `serious`, `attention`, `none_found`, `incomplete`, `neutral`.
- Do funkce se **nepředává žádný výsledek, text, URL, IČO, název ani nález.** Únik citlivých údajů tak není možný už z konstrukce. Testuje se nad všemi 6 × 5 kombinacemi a se sentinely ve vstupu stránky.
- **Odkaz** je pevná kanonická adresa checkeru (`https://verimtomu.fyi/overit-zpravu` atd.), bez query a bez fragmentu. Neodvozuje se z `location`, takže nesdílí ani `#ico=`.

### 4.2 Postup akce „Poslat výsledek blízkému“

1. Pokud existuje `navigator.share`, zavolá se `navigator.share({title, text, url})`.
   - Úspěch → stav „Výsledek je připravený ke sdílení.“
   - `AbortError` (uživatel zrušil) → stav „Sdílení bylo zrušeno.“, **bez dalšího fallbacku**.
   - Jiná chyba → krok 2.
2. Pokud je dostupné `navigator.clipboard.writeText`, text se zkopíruje → „Text je zkopírovaný. Vložte ho do zprávy pro blízkého.“ Při chybě → krok 3.
3. **Ruční fallback:** zobrazí se `<textarea readonly>` mimo formulář, bez `name`, s označeným textem a instrukcí „Text označte a zkopírujte.“ Fokus přejde na textareu.

Stav se oznamuje přes `role="status"` (`aria-live="polite"`). Tlačítko je `<button type="button">` s výškou aspoň 48 px a funguje Enterem i mezerníkem.

### 4.3 Umístění tlačítka

| Plocha | Místo |
|---|---|
| `check-view` kombinovaný výsledek | za blok „Co udělat teď“, před „Proč tento výsledek?“ (volba `share:{type}` v `renderCombinedResult`, výchozí vypnuto kvůli zpětné kompatibilitě) |
| `/proverit-firmu` | `firm.js` za `renderVerdict`, do `#firm-followup` (jen samostatný výsledek, ne vnořený) |
| F5a (Zpráva, Půjčka) | vedle „Prověřit další zprávu“ (`#next-check`); kategorie N, nebo kategorie kombinovaného výsledku, pokud existuje |
| Smlouva | v `.contract-actions` vedle „Zkopírovat otázky“ |

### 4.4 Technika

- Nový statický modul `public/share-result.js` (bez DOM side-effectů při importu, bez `fetch`, bez úložiště).
- Jedna položka statického whitelistu v `src/server.js`; jinak beze změny.
- Žádné `localStorage`, `sessionStorage`, cookie ani analytika. Do sdílení se nic neloguje.
- Žádné generování obrázku (canvas, OG) ani veřejného odkazu na výsledek.

---

## 5. Texty ke sdílení (S8.3, návrh)

Formát: **titulek**, prázdný řádek, **věta kategorie**, **poznámka checkeru**, prázdný řádek, **odkaz**. Bez procent, bez skóre, bez jmen.

**Titulek:** „Věřím tomu? – kontrola zprávy / nabídky půjčky / smlouvy / webu / firmy / investiční nabídky“

| Kategorie | Věta |
|---|---|
| 1 Vysoké riziko | „Výsledek: našli jsme závažné varovné signály. Než cokoli zaplatíte, podepíšete nebo sdělíte, ověřte si to jinou cestou.“ |
| 2 Pozornost | „Výsledek: stojí za pozornost. Kontrola našla signály, které je dobré si nezávisle ověřit.“ |
| 3 Bez nalezených rizik | „Výsledek: nenašli jsme výrazné varovné signály. To neznamená, že je vše v pořádku. Kontrola nemůže zaručit bezpečnost.“ |
| 4 Nedokončeno | „Výsledek: kontrolu se nepodařilo dokončit nebo z dostupných údajů nelze posoudit. Chybějící ověření neberte jako dobrou zprávu.“ |
| N Neutrální (F5a) | „Kontrola proběhla. Doporučený postup: požadavek si ověřte jinou cestou, přes kontakt, který už znáte.“ |

**Poznámka checkeru** (vždy přiložená, u všech kategorií):

| Checker | Poznámka |
|---|---|
| Zpráva | „Odesílatele ani odkazy jsme neověřovali.“ |
| Půjčka | „Oprávnění poskytovatele u ČNB jsme automaticky neověřili.“ |
| Smlouva | „Kontrola nenahrazuje právní posouzení.“ |
| Web | „Web jsme nenavštívili a jeho provozovatele neověřujeme.“ |
| Firma | „Zápis v registru není záruka bezpečnosti.“ |
| Investice | „Oprávnění ČNB jsme automaticky neověřili. Nejde o investiční doporučení.“ |

**Odkaz:** „Vlastní kontrolu si můžete udělat na https://verimtomu.fyi/<checker>“.

**Pravidla pro texty:**
- Všechny věty musí projít `isSafeCopy`.
- Test zakazuje: „bezpečn(é|á) je“, „ověřeno“, „v pořádku je“, `%`, `/100`, čísla s výjimkou adresy.

---

## 6. Nálady postav (S8.4, návrh)

| Stav | Věrka (hlavní) | Robo (vedlejší) | Poznámka |
|---|---|---|---|
| Uvítání | `verkarob` (homepage, beze změny); `verka-welcome` volitelně na vstupu checkerů | `robo-default` | — |
| Probíhající kontrola | — | `robo-analyzing`; `robo-searching` u dotazu do registrů | stávající stav zachován |
| Vysoké riziko | `verka-warning` | volitelně `robo-warning` | text nadpisu je vždy nad postavou |
| Vyžaduje pozornost | `verka-explaining` | `robo-tip` u „Co udělat teď“ | tip, ne verdikt |
| Bez nalezených rizik | **`verka-thinking`** | žádný Robo | nikdy `verka-success` ani `robo-success` |
| Nedokončeno / nelze posoudit | `verka-thinking` | `robo-searching` (chybí zdroj); `robo-error` jen při technické chybě | budoucí `robo-incomplete` |
| Sdílení výsledku | bez postavy (budoucí `verka-share`) | — | potvrzení textem |
| F5a | beze změny (`verka-explaining`, `robo-default`, `robo-success` jen „zpracování dokončeno“) | — | F5a nemá úroveň (D1) |

**Pravidla:**
- Postava nikdy nenese jediný význam. Vždy je u ní pevný nadpis úrovně a `alt` popisuje roli, ne verdikt (např. „Věrka upozorňuje“, nikdy „vše v pořádku“).
- Úspěšné pózy (`*-success`) se nevážou na výsledek kontroly.
- Výměna postavy v `check-view` a `verdict-view` je jen prezentační: mapa `level → asset`. `CheckResult`, agregace ani nadpisy se nemění.

---

## 7. Animace — budoucí rozšíření (mimo Stage 8)

Rozhodnutí autora: Stage 8 **nepřidává žádné animace**. Platí to pro pohyb, pulzování nebo poskakování postav, animované přechody výsledkových karet i animace při sdílení nebo kopírování. Postavy se mění jen staticky (výměna obrázku podle úrovně).

Návrh pro pozdější release (jen evidence, neimplementovat):
- jen CSS, bez externích knihoven;
- jednorázové krátké objevení výsledku (≤ 250 ms, posun ≤ 8 px);
- žádné nekonečné animace ani blikání;
- `prefers-reduced-motion: reduce` vypíná vše;
- animace nesmí posunout fokus ani zpozdit `aria-live`.

Ve Stage 8 zůstávají stávající animace beze změny: průběh načítání a jeho stávající omezení přes reduced-motion. Test S8.6 ověří, že nové třídy Stage 8 nemají `animation` ani `transition`.

---

## 8. Bezpečnostní a UX pravidla

1. Sdílený text vzniká **jen z pevných výčtů** (`checkerType`, `category`). Žádný vstup uživatele, výsledek, nález, citace, URL, IČO, DIČ, jméno, telefon ani identifikátor.
2. Žádná data v URL (query, fragment). Odkaz je kanonická adresa checkeru.
3. Žádné serverové ukládání, sdílený odkaz na výsledek, obrázek výsledku ani měření sdílení.
4. Zrušení nativního sdílení není chyba a nespouští fallback.
5. Bez výsledku (chyba, probíhající kontrola) se tlačítko nezobrazí. Po „Prověřit další …“ se odstraní.
6. Kategorie 3 vždy obsahuje „To neznamená, že je vše v pořádku“. Kategorie 4 vždy „Chybějící ověření neberte jako dobrou zprávu“.
7. U Půjčky a Investice je vždy uvedeno neověřené oprávnění ČNB, u Smlouvy chybějící právní posouzení.
8. Postavy nevytvářejí pocit bezpečí: úspěšné pózy se nepoužijí u výsledků (§6).
9. Přístupnost: klávesnice, 48 px, `role="status"`, ruční fallback s fokusem, kontrast podle design systému.
10. Beze změny: algoritmy checkerů, planner, agregace, API, limity, relay, AI, CSP, `Permissions-Policy`, homepage obsah a sitemap.

---

## 9. Rozhodovací otázky

| # | Otázka | Doporučení |
|---|---|---|
| D1 | Jakou kategorii sdílí samotný výsledek F5a (Zpráva, Půjčka bez kombinovaného výsledku)? | **Neutrální variantu N**, bez kategorie. F5a záměrně nezobrazuje úroveň; sdílení ji nemá vytvářet. S kombinovaným výsledkem se sdílí jeho úroveň. |
| D2 | Smlouva: kategorii odvodit přes existující `fromContract`? | **Ano** (nálezy → 2, jinak 4). Žádná nová logika. |
| D3 | Odkaz: kanonický `https://verimtomu.fyi/…`, nebo `location.origin`? | **Kanonický**, aby se nesdílely testovací ani interní hostnamy. |
| D4 | Postava pro „bez nalezených rizik“: `verka-thinking`, nebo `verka-explaining`? | **`verka-thinking`**. Vizuálně podporuje „to neznamená, že je vše v pořádku“. |
| D5 | Objednat `verka-share` a `robo-incomplete`? | **Volitelně.** Kvůli deadlinu implementovat s náhradami (§1) a assety doplnit, až je schválíte. |
| D6 | Měnit postavy u výsledku F5a? | **Ne.** F5a zůstává beze změny; mapování se týká jen kombinovaného výsledku a výsledku firmy. |

---

## 10. Doporučený postup implementace

| Krok | Obsah | Soubory | Test |
|---|---|---|---|
| **S8.2** | `share-result.js` (texty a 3stupňový fallback), tlačítko na 4 plochách | `public/share-result.js`, `check-view.js` (volba), `firm.js`, `app.js`, `contract.js`, HTML (místo pro stav), `src/server.js` (+1 whitelist) | unit: 30 kombinací, sentinely (text, URL, IČO, telefon, jméno, `#ico=`) nikdy ve výstupu; mock `navigator.share` (úspěch, `AbortError`, chyba), clipboard (úspěch, chyba), ruční fallback |
| **S8.3** | finální texty §5 a výčty | `share-result.js` | `isSafeCopy`, zakázané výrazy, povinné poznámky (ČNB, právní, „neznamená“) |
| **S8.4** | statická mapa `level → postava` v `check-view` a `verdict-view` (jen schválené assety) | `check-view.js`, `verdict-view.js` | unit: mapování všech 5 úrovní, nikdy `*-success`; regrese nadpisů |
| ~~S8.5~~ | animace přesunuty mimo Stage 8 (§7) | — | statický test: nové třídy Stage 8 bez `animation`/`transition` |
| **S8.6** | browser QA a release | `scripts/stage8-browser.js`, `docs/reviews/STAGE8.md` | Chromium s/bez `navigator.share`, odepřený clipboard, ruční fallback, klávesnice, 320/375/430/1280, reduced-motion (žádné nové animace), síťový spy (0 nových požadavků), regrese Stage 3–7, `npm test`, `npm run check`, strict gate, Docker Node 24 gate |

**Odhad:** S8.2 + S8.3 ~1 den; S8.4 ~0,5 dne; S8.6 ~0,5 dne. Deadline 26. 10. je reálný.
