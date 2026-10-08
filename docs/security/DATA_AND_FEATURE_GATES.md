# Citlivý obsah a uzavřené feature gates

## Aktuální rules beta

Přípustný JSON body ≤64 KiB, content ≤10 000 znaků a ≤16 000 UTF-8 bytes; typ text nebo url. UTF-8 je striktní, komprimované request body se odmítá. Rules není AI detektor ani potvrzení bezpečnosti. URL vstup je pasivní zápis; HTTP stránka, DNS, favicon ani redirect se nenavštěvují. Upload endpoint neexistuje, multipart vrací 415 a image/PDF input 400. Static allowlist obsahuje pouze schválené soubory; nikdy uploady nebo canonical reference v docs.

Obsah a výsledek existují v RAM a v DOM otevřené stránky, bez historie, DB, analytics či obsahových logů. Po dokončení/timeoutu/odpojení se uvolňují reference; nelze slibovat okamžité přepsání V8 paměti. Crash dumpy, core dumpy, heap snapshots a request-body tracing v produkci zakázat. Swap může obsahovat RAM: pokud potřebný, šifrovaný; nezařazovat jej do záloh.

HMAC IP není anonymní údaj. Klíč je pouze náhodný v RAM procesu. IP/session limiter metadata expirují za 60 s a jsou líně odstraněna následujícím požadavkem nebo restartem; počet klíčů má cap 10 000. Session cookie guard_session: náhodné ID, expirace a HMAC; 1 hodina, Secure/HttpOnly/SameSite Strict v produkci. Není tracking ani uživatelský účet. Žádný session secret nevyžaduje persistentní přenos mezi releasy. Restart je reset procesových kvót, nikoli reset budoucího budgetu.

## Navržená provozní retence (potvrdit člověkem)

| Data | Uložení a pravidlo |
|---|---|
| Text/výsledky/soubory | Žádná trvalá kopie, žádné body logy, žádné zálohy vstupů |
| IP/cookie/user agent/query | Neukládat v app logu; nedělat query-string obsahový vstup. Cloudflare/provider mají vlastní zpracování — ověřit účet, DPA a nastavení |
| App/connector stdout | Jen pevné startup/error metadata, Docker local rotation app 3×10 MB / connector 2×5 MB; velikostní cap není časová retence |
| Host logy | Cílit na 7 dní, přístup pouze adminům. journald nastavit MaxRetentionSec=7day a velikostní cap. App Docker logy přezkoumat týdně a zajistit časovou retenci odděleným sanitizovaným log procesem; nemažte ručně interní Docker soubory |
| Sanitizované metriky | Pouze celkové counts/status-class/latency buckets/CPU/RAM/disk, žádné URL query, obsah, session či IP label. Navržená retence 30 dní; export zatím neimplementován |
| Budoucí budget ledger | UTC den, attempt count a integer rezervace; lifetime total trvale. Bez payload/IP/session. Staré denní řádky lze archivovat až po účetní kontrole, lifetime total nikdy smazat/vrátit rollbackem |
| Config backup | Šifrovaně off-host, 7 denních / 4 týdenní kopie, bez textů a RAM. Token raději znovu vydat; pokud zálohován, výhradně oddělený secret vault. Klíč obnovy mimo VPS |

Cloudflare ukončuje TLS a technicky zpracovává text, IP a metadata. Tunnel HTTP mezi dvěma kontejnery na vlastním hostu neznamená end-to-end šifrování vůči Cloudflare. Právní základ, zpracovatelé/VPS region, případné přenosy, doby retence, provozovatel a privacy kontakt musí být doplněny před publikací. Aktuální /privacy stále popisuje neveřejný prototyp: P1 blocker. Nenahrazujeme jej smyšlenými údaji. Před aktivací AI musí srozumitelně vysvětlit odesílání obsahu konkrétnímu poskytovateli a skutečné smluvní podmínky/retenci, ne slib „nic neukládá“.

## AI activation gate — nyní ZAVŘENO

Production guard: AI_MODE=rules, všechny daily/total budgety 0, retry 0, critic false, local false, žádný GUARD_LLM_API_KEY. Image i deployment health odmítají AI režim. Runtime nevytváří budget DB v rules. Klient nemůže vybrat model, endpoint, ceny, limity ani přepnout režim.

Existuje: serverové provider rozhraní, bounded queue 2 workers / 20 waiting default, job deadline 20 s, max provider body 64 KiB, input byte/token upper-bound, output token cap, strukturované schema a evidence/safety, atomické SQLite BEGIN IMMEDIATE rezervace před každým pokusem. Každý retry/critic rezervuje znovu; timeout/unknown result bez refund nebo automatického retry. Denní UTC a lifetime cap jsou společné pro procesy se STEJNOU persistentní lokální DB; 4 souběžné worker testy to ověřují. Není to multi-host globální účetnictví ani kalibrovaný model.

Před samostatně schválenou aktivací je nutné:

1. Ověřit tokenizer/framing/schema horní mez, ceny obou modelů a chargeable tokens včetně reasoning. Byte odhad a ručně zadané ceny nejsou absolutní garance účtu poskytovatele.
2. Ověřit případný skutečně vynutitelný provider account/project cap. Pokud jde jen o soft alert, výslovně to uvést; přidat oddělené účetní monitorování a rychlou revokaci klíče. Nikdy nepředstírat existenci provider hard capu.
3. Persistentní budget store mimo image, backup bez účetního rewind, fail-closed při nedostupnosti/korupci/busy; blokující SQLite busy wait převést mimo HTTP event loop před zátěží. Kill switch = revokace klíče + schválený rules-only release. Žádný skrytý fallback AI → úspěšný rules výsledek.
4. Per-IP/session + globální API limit a worker cap, prověřit NAT/IPv6; pro více hostů centrální quota, broker, atomický budget, TTL, encrypted jobs, žádné payload dead-letter logy.
5. Idempotency: náhodný request key vázaný na podepsanou session, bounded TTL metadata; nedělat dedup cache s plaintextem. Po nejasném provider výsledku neprovádět automatický redelivery. Nové ruční odeslání dnes není deduplikováno — povinná nová implementace/test gate.
6. Provider endpoint jen schválený admin allowlist a egress, HTTPS/no redirects, serverový secret ve vaultu, žádné klientské credentials. Test reálného modelu pouze s explicitně schválenými syntetickými daty a minimálním budgetem.
7. Nezávislý adversarial dataset: role injection, fake system text, kontakty všech jazyků/TLD, nesprávné důkazy, overconfidence, poisoning. Regex safety není sémantická garance; pevné verification templates a bez tools zůstávají závazné.

## Upload activation gate — nyní ZAVŘENO

Nevytváříme falešný parser nebo „antivirus“ flag. Navrhované rozhraní budoucího workeru: receive bounded bytes + claimed MIME → validate signature/format → isolated decode/extract → bounded plain-text/evidence → stávající analysis/safety. Worker nemá app/tunnel/API secrets, socket, host mounts, síť ani privilegia. App nesmí renderovat/servírovat původní upload.

Pro první image etapu navržené maximum: 5 MiB, pouze PNG/JPEG/WebP, žádné SVG/GIF/animace; shoda MIME a magic bytes, reject polyglots/trailing active data, max 4096 px na stranu a 16 megapixelů, decoded RAM limit 128 MiB, processing deadline 5 s, sandbox RAM 256 MiB / CPU 0.5 / PID 32. Testovat truncated/corrupt data, EXIF/ICC bombs, overlarge dimensions, decompression bombs, multipage/animated WebP/APNG a známé decoder CVE corpus. Čísla musí potvrdit skutečný dekodér a VPS benchmark; dnes nejsou vynucována, protože uploads neexistují.

PDF až následně: max 5 MiB / 20 stran / 10 s extraction jako výchozí návrh; odmítnout šifrování, JavaScript, Launch/URI actions, embedded files, XFA, external references, neomezené object streams, recursive/zip bombs a oversized raster pages. Žádný browser PDF renderer v serveru. Extrakce procesem s timeout/kill/cgroup a vypnutou sítí. Testovat malformed xref, recursive objects, parser exploits a sandbox boundary. OCR/text jsou nedůvěryhodná data, nikoli instrukce.

Je-li disk nutný: random UUID/O_EXCL názvy mimo public, mode 0600 v tmpfs noexec/nosuid/nodev; žádná uživatelská cesta/název, žádné symlinks. Cleanup v finally + po kill/restart, krátká TTL, žádné backups a žádný upload URL endpoint. Noexec není úplný zákaz interpretace obsahu — žádný eval, shell nebo spuštění dokumentu.

## URL fetching gate — nyní ZAVŘENO

Budoucí URL worker má omezený outbound přístup; žádný app ingress, admin síť nebo secrets. HTTPS-only, port 443, bez credentials a nepovolených protokolů; oddělený DNS resolver. Zakázat localhost, private/loopback/link-local/multicast/unspecified/reserved rozsahy IPv4/IPv6, IPv4-mapped a další přechodové reprezentace, cloud metadata (např. 169.254.169.254) a vlastní Docker/admin adresy. Nepoužívat pouze string-prefix/hostname denylist.

Každý A/AAAA výsledek musí být public; spojení pinovat na ověřený IP při zachování původního TLS SNI/cert ověření a Host. Neponechat druhé nezávislé DNS rozlišení HTTP klientovi. Default redirect error; pokud někdy povolené, nejvýše 3, každý cíl znovu validovat a pinovat, žádný downgrade/credential forwarding. Deadline DNS/connect/read, max 1 MiB přijatých i dekomprimovaných bytes, žádné cookies/login/JS/subresources. Egress firewall nezávisle blokuje private/metadata — app helper samotný nestačí.

Gate corpus: DNS public→private změna, směs A/AAAA, redirect na metadata/IPv6/mapped IPv4, decimal/hex/octal IP zápisy, IDN/trailing dot, userinfo @, redirect loops, slowloris, gzip bombs a nepovolené porty. Spustit proti izolované síti s kontrolovaným DNS; teprve poté samostatně povolit feature a upravit privacy/threat model.
