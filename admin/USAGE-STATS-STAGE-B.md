# Etapa B — připravená, nenasažená

Ověřená produkce 13. 10. 2026: revision 589fe511e3d7a27ff87f233117a4fdea6e97d417, image sha256:9cd6b51297f3bbf8d7f5965db8c883eddaf338ba6d0bda05762dde3e7bcf300f. Původní src/server.js odpovídá Gitu, SHA256 e6062d1fd821aaf13b0f2e9804e4b7fd59bbca9bb51e18b0344971f983741500.
Dashboard aktuálně image sha256:ba82de25b96c8c9f999fc75b3a7958ba4c41f14e50fbbde953dd707cc06afd45, změny Cloudflare 0254e69. Lokální checkout obsahuje také dřívější frontendové commity 4f18143/98325df/1e0d314, které nejsou v produkci. Nasazení této etapy proto musí přenést jen vyjmenované backendové soubory, ne celý lokální frontend.

## Definice metrik

Kontrola zprávy je úspěšná HTTP 200 odpověď /api/analyze, kde vstup nemá explicitní topic loan. Zahrnuje text a samostatné odkazy. Počítá se jednou v události response finish a pouze při writableFinished. To znamená odpověď dokončenou serverem, ne potvrzení přečtení v prohlížeči. Close, chyba HTTP, timeout a analýza bez odpovědi se nepočítají.
Pravidla: rules-v1, včetně kontroly bez AI souhlasu (declined). AI: rules+ai-v1. Náhradní: rules-v1 s ai_status not_performed a jiným důvodem než declined. Součet se skládá z těchto tří navzájem výlučných kategorií.
Žádné počty unikátních osob. Nabídky s explicitním topic loan a místní kalkulačka nejsou v této etapě započítány.

## Minimální předání dat

Veřejná aplikace má oddělenou SQLite /usage-private/usage.sqlite, do které zapisuje pouze worker. Daily tabulka má jen day, rules, ai, fallback; metadata jen den zahájení měření. Worker dostává pouze enum režimu, nikdy text, odesílatele, IP, cookie, výsledkové ID ani identifikátor uživatele.
Worker atomicky exportuje soubor /usage-export/summary.json: schema version, čas posledního exportu, začátek měření a nejvýše 400 denních řádků. Export se obnovuje po zápisu a každou minutu.
Dashboard má mount pouze /usage-export jako READ ONLY a čte soubor asynchronně, s omezením velikosti a kontrolou schématu. Nemá přístup k SQLite, ai-data, OpenAI klíči ani session secretu.
Neexistuje nový HTTP endpoint veřejné aplikace. Dashboard vrací souhrny jen přes již existující JWT chráněné /api/dashboard. Nedochází k propojení aplikačních sítí ani k otevření nového portu. Dosavadní Cloudflare token mount zůstává samostatný, read-only.

## Chování při chybě

Worker má omezenou frontu 64 zpráv a vlastní paměťový limit. Přetížená fronta, chyby SQLite/exportu či nefunkční worker nesmějí ovlivnit hotovou HTTP odpověď. Statistika je best-effort: při výpadku či násilném restartu mohou počty chybět a bez ukládání jednotlivých událostí je zpětně nedopočítáme. Dashboard označuje snapshot starší než 3 minuty jako neobnovovaný; chybějící nebo neplatný export jako nedostupný. Nezobrazuje nuly místo chybějícího zdroje.
Dny před zahájením měření jsou v grafu neznámé, nikoli nulové. Souhrny 7/30 dní označí neúplné období. Denní hranice Europe/Prague. Žádný import starších kvót jako dokončených kontrol.

## Budoucí nasazení (nyní neprovedeno)

1. Před nasazením znovu ověřit produkční image a zdrojové hashe, nemá-li známé změny. Zachovat veškerou současnou konfiguraci, AI, limity a firewall.
2. Vytvořit samostatné adresáře /opt/verimtomu/usage-private (vlastník 65532, 0700) a /opt/verimtomu/usage-export (vlastník 65532, 0755). Žádné tajné údaje v exportní složce.
3. Veřejné aplikaci přidat tyto dvě RW directory mounty do /usage-private a /usage-export, USAGE_DB_PATH=/usage-private/usage.sqlite a USAGE_SNAPSHOT_PATH=/usage-export/summary.json. Změnit jen src/server.js + tři src/usage-stats*.js. Žádný frontend z aktuálního checkoutu automaticky nepřibalovat.
4. Dashboardu přidat pouze RO directory mount exportní složky do /usage-export a USAGE_SNAPSHOT_PATH=/usage-export/summary.json. Mountovat adresář, protože atomický export mění inode souboru. Aktualizovat admin/src/usage.js, config.js, server.js a public/index.html, app.js, style.css. Zachovat skutečný CF_ZONE_ID, mount tokenu, AUD, Access a síť.
5. Krátce ověřit jednu pravidlovou odpověď a souhrn; žádné rozsáhlé testy. Dřívější data před začátkem měření zůstanou neznámá.

Cílené testy: 5 prošlo — klasifikace, jednorázové počítání finish/200 a odmítnutí close/chyb, neovlivnění odpovědi při chybě statistik, restart SQLite/den v Praze/souhrny, neplatný export a nefunkční worker. Zdroj neobsahuje nový veřejný administrační endpoint.
Zatím nic necommitnuté, nepushnuté ani nenasazené.
