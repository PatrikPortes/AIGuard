# Věřím? — etapy a acceptance criteria

Aktualizace 2026-10-08: Security Gate 1 má nyní prioritu před novými features. Samostatné VPS místo domácího serveru; produkční příprava rules-only, zero AI budgets, bez upload/fetch. Lokální hardening/testy hotovy, veřejný deployment **BLOCKED** do uzavření [P0/P1 gate](security/SECURITY_RELEASE_GATE.md). [Validace](security/VALIDATION_REPORT.md), [deployment plán](DEPLOYMENT_PLAN.md), [future feature gates](security/DATA_AND_FEATURE_GATES.md). Níže je původní cílový harmonogram, nikoli potvrzení schválené produkční aktivace.

Každá etapa končí testy a stručným reportem. Harmonogram je cílový, závisí na modelu, hostingu a výsledcích testů; deadline soutěže 31. 10. 2026.

| Etapa | Výsledek a ověření | Cíl |
|---|---|---|
| 1 Základ | Česká responzivní homepage, privacy, HTTP server; homepage a health vracejí 200; automatický smoke test | 7.–8. 10. |
| 2 Textový základ | Strukturovaný JSON, čtyři rizikové úrovně, vysvětlení, nezávislé kroky, jednoduchý režim; test rodinného podvodu, legitimního textu, injection a validačních chyb; jasně přiznaná pravidlová baseline | 8.–9. 10. |
| 3 Modelový adaptér | Serverová AI analýza textu, schéma, timeout, oddělený nedůvěryhodný vstup, critic; mock testy a skutečný test s bezpečným syntetickým vstupem; bez klíče nelze claimovat AI připravenost | 9.–12. 10. |
| 4 Screenshot | Drag & drop i klávesnice, PNG/JPEG/WebP, podpis+MIME, 5 MB, pixel limit; syntetický screenshot projde stejnou pipeline; poškozené soubory odmítnuty; žádný závěr o AI původu | 12.–14. 10. |
| 5 PDF | Bezpečná extrakce s limity a timeoutem, bez odkazů a aktivního obsahu; faktura analyzována, sken bez textu má srozumitelný limit; cleanup ověřen testem | 14.–16. 10.; případně odložit |
| 6 Kontext a UX | Nejvýše 3 otázky jen při chybějícím kontextu, odpovědi skutečně mění analýzu; loading/error, mobil, klávesnice a čtečka; bezpečné kroky ve všech výsledcích | 16.–18. 10. |
| 7 Vyhodnocení | 35 syntetických scénářů: 10 legitimate, 10 jednoduchých scam, 10 sofistikovaných scam, 5 uncertain; ground truth; automatická matice, FP/FN a nejisté případy zvlášť; vyhodnocení nesmí používat testovací štítky jako vstup | 18.–19. 10. |
| 8 Feedback a admin | Anonymní agregace, souhlas, deduplikace a omezení zneužití; chráněné admin API; žádný uložený citlivý vstup; užitečnost a bezpečný další krok měřeny zvlášť | 19.–20. 10. |
| 9 Security a nasazení | Negativní testy uploadů, URL, XSS, injection, rate limitů; HTTPS a modelové limity; veřejný smoke test; žádný nevyřešený kritický nález | 20.–22. 10. |
| 10 Testeři a soutěž | 20–50 skutečných testerů 22.–27. 10., opravy a final evaluation 27.–29. 10., materiály 29.–30. 10., rezerva 31. 10. | do 31. 10. |

Nejmenší soutěžní MVP: text + screenshot + bezpečné ověření + nejistota + privacy + dataset + feedback a měření. PDF odstraníme jako první, pokud ohrozí termín. Statistiky z briefu jsou podklady dodané zadavatelem; před publikováním ověřit zdroj a metodiku. Úspěšnost nikdy neprezentovat bez velikosti a skladby datasetu; odlišit testovací metriky od skutečného uživatelského dopadu.

## Zpřesnění etapy 3 (požadavek veřejné služby)

Nejdříve TEXT → AI → STRUCTURED RESULT. Zachovat rules jako první vrstvu. Serverový provider interface, výstupní schéma a bezpečné šablony, routing, podmíněný critic, queue/worker rozhraní, per-IP a podepsaná anonymní session, trvalé atomické denní/celkové budgety, timeout, bounded retries a přetížení bez dalších AI callů. Acceptance: celý HTTP tok s simulovaným providerem, skutečný provider test až s existujícím použitelným klíčem, concurrent budget race + restart + půlnoc + retry + critic, queue overload/cancel, neplatný/škodlivý JSON a žádný únik obsahu/klíčů. Žádný mock se nesmí vydávat za skutečný AI test. Multihost škálování potřebuje sdílený broker/účetní store a distribuované limity; do té doby je zakázané konfigurací. CAPTCHA je rozhraní s fail-closed požadavkem na verifikátor, integrace konkrétní služby zůstává navazující.

Etapa 4 (screenshot) se neotevře, dokud skutečný textový provider test a textová pipeline neprojdou. PDF až po screenshotu. Pokud chybí přístup k providerovi, dokončit všechny nezávislé textové testy a zapsat konkrétní externí blocker; média nezačínat.


## Designová integrace před další funkcionalitou

Schválený canonical visual reference: **`docs/design/VERIM_VISUAL_REFERENCE.png`**. Design systém: [DESIGN_SYSTEM.md](design/DESIGN_SYSTEM.md); stav reference a samostatných ilustrací: [ASSETS.md](design/ASSETS.md). Vizuální integrace zahrnuje skutečné responzivní UI, textovou značku Věřím?, tagline, uvítání Věrky, systémový loading Roba, oblé pastelové karty a strukturovaný výsledek s textově označenými stavy. Originál styleboardu je dosud nedostupný jako soubor; jeho bezeztrátové uložení je otevřený blocker. Produkční postavy musí být dodány ze stejné schválené identity. Žádné generované alternativy ani výřezy reference. Backend zůstává beze změny. Vizuální integrace neotevírá screenshot/PDF etapy; nejdříve skutečný OpenAI textový smoke test.


## Security Remediation 1 (před stagingem)

Původní review commit fde14ba… byl zveřejněn a Claude review importováno byte-exact z1e26f6c…. Opravy na lokální security/gate-1-remediation: fairness/body admission/regex/normalizace/neutrální verdict/__Host cookie/immutable bounded character delivery/no-JS privacy/egress isolation/immutable release identity. Žádná AI nebo media etapa se neotevírá. [Current report](security/REMEDIATION_1_REPORT.md), [release gate](security/SECURITY_RELEASE_GATE.md). **BLOCKED** do externího retestu, CVE disposition a real staging/VPS/CF/privacy/release approval; opravy nebyly commitnuté ani pushnuté.
