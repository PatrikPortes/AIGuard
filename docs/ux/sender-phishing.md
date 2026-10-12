# Nepovinný odesílatel a phishing — 12. 10. 2026

Pracovní větev: `feature/sender-phishing-2026-10-12`, základ UX audit `84b125503bba34af48532de959d0250b07916b0c`. Žádný commit, push ani nasazení.

## Změny

- Formulář ověření zprávy má nepovinný jednořádkový odesílatel (e-mail, telefon nebo název, nejvýše 256 znaků / 1024 UTF-8 bajtů). Neřetězcové hodnoty a řídicí znaky jsou odmítnuty. Stejná validace funguje pro HTTP vstup a opakované využití připraveného vstupu.
- Lokální orientační srovnání deklarované organizace a domény, včetně podobných domén, záměny některých znaků a domén typu `facebookmail.com.evil.example`. Přehled značek je záměrně omezený na Meta/Facebook a Českou poštu. Je rozšiřitelný, není úplným seznamem jejich legitimních odesílatelů ani allowlistem důvěryhodných zpráv. Jiní oprávnění partneři mohou být označeni k nezávislému ověření.
- Známá doména ani zobrazované jméno nesnižují riziko vyplývající z obsahu a nejsou důkazem pravosti. Telefonní číslo a samotný název nepovažujeme za ověřenou identitu. Žádné DNS, SPF/DKIM, síťové ověření ani otevření URL se neprovádí.
- Nové lokální signály hrozby omezení účtu a výzvy k otevření odkazu. Kombinace závažných signálů dostane konkrétní hlavní doporučení „Na odkaz ve zprávě neklikejte. Přihlaste se přímo přes oficiální web nebo aplikaci služby.“ UI toto doporučení zvýrazní; neodvozuje verdikt ze skóre a netvrdí, že podvod byl prokázán.
- Opraven kořen falešného platebního signálu: samotné `účtu` už nepatří do platebního pravidla. Převod vyžaduje finanční kontext. Skutečné platby, faktury a žádosti o peníze zůstávají detekovány.
- Samostatný údaj odesílatele není odesílán do AI. Také modelové směrování a pomocné signály pro poskytovatele se sestavují bez odesílatele. Souhlas s AI zůstává souhlasem s textem; pokud uživatel adresu sám vloží do textu, bude součástí textu odeslaného po souhlasu. Odesílatel není ukládán do databáze ani aplikačních logů. Stránka soukromí a formulář to vysvětlují.
- Změna odesílatele skryje předchozí výsledek; nový příklad a nová kontrola jeho pole vymažou. Na půjčce se nové pole nezobrazuje.

## Cílené kontroly

- 6 nových testů: přijímané a odmítané vstupy, falešný signál reklamního účtu, skutečné platby, kombinace phishingu, neautentizovaná známá doména, ochrana opakovaného využití vstupu a nedoručení odesílatele do AI včetně nezměněných zpráv a volby modelu. Poskytovatel byl stub; žádné skutečné AI volání.
- 15 existujících testů půjčky prošlo (včetně místního HTTP a stubovaného poskytovatele). Žádný široký audit ani opakovaná celá sada.
- Lokální prohlížeč: společné odeslání textu a odesílatele, zvýrazněné hlavní doporučení, bez falešného signálu platby, reset odesílatele, běžný příklad bez odesílatele. Náhled běžel v režimu pravidel.

Limity: heuristiky mohou upozornit i na pravou komunikaci a nepoznají všechny značky či formy phishingu. Původní konkrétní text chybného reklamního upozornění nebyl dodán; příčina byla ověřena na obecné kategorii upozornění na reklamní/uživatelský účet, nikoli jen na jedné frázi. Při nasazení musí být zahrnut nový `src/sender.js` a změny analýzy/pipeline; samotný starý frontendový overlay nestačí.

## Podklady

- https://about.fb.com/ltam/news/2017/12/nueva-herramienta-de-seguridad-en-facebook/ — Meta popisuje `facebookmail.com` jako jednu z používaných domén a doporučuje ověřovat oznámení přímo v nastavení účtu.
- https://www.facebook.com/help/1634546593478660 — oficiální přehled ověřování zpráv; aktuální načtení vyžadovalo přihlášení, úplnost seznamu není tímto auditem potvrzena.
- https://nukib.gov.cz/cs/infoservis/doporuceni/1494-phishing-stale-aktualni-hrozba/ — domény napodobující instituce a nezávislé ověření.
