# Samostatné VPS — review runbook po Remediation 1

**Není oprávnění k nasazení. SECURITY GATE BLOCKED.** Žádný VPS/Cloudflare/DNS deployment nebyl proveden. Nejdřív externí retest/CVE dispozice, restricted staging a samostatné lidské schválení konkrétního commit/tree/image scope. Původní root review commit je zveřejněn; remediation kód dosud není commitnutý/pushnutý.

## Host a tajemství

Zachovat samostatný amd64 VPS bez vazby na domácí projekty; skutečná IP/admin source CIDR/OS/patching/region musí být auditované, nikoli odhadnuté. Existing plán Ubuntu24.04 LTS není důkaz aktuálního hostu. MFA/recovery console, key-only SSH a root/sudo pouze lidskému adminovi; nezakázat recovery před ověřenou druhou SSH relací. Docker28+ a Composev2 z ověřených official packages, default seccomp/nonroot/NNP/cgroups. Agenti/CI/app nikdy nemají production SSH/CF credentials nebo Docker socket. Nepoužívat self-hosted production runner či autoheal se socketem.

VPS public inbound **pouze administrační22/tcp z auditovaného source CIDR**; Tunnel varianta nepotřebuje public80/443 ani3000/43127. Cloudflare poskytuje HTTPS. IPv4 i IPv6/provider firewall/external scan musí potvrdit skutečné chování; nezkopírovat web-reverse-proxy plán s public app porty. App neposlouchá na hostu: uvnitř container0.0.0.0:3000, **žádná Compose publikace portu**.

Token pouze connectoru jako file secret, owner65532:65532/mode0400/root-restricted parent; ověřit skutečná bind-mount práva (Compose uid/mode se nemusí vynutit). CF admin/API token nesmí být v serverenv/image. Rules app žádný secret mount/APIkey/persistent budget volume. Deployment env není shell script: helpers jej nesourcují. Žádný secret v argv/history/logu/Git/container dumpu. App stderr/stdout fixed metadata; body/cookie/query/core/heap debug logging zakázán. Host/CF privacy/retence je release gate.

## Network gate CR09 — povinné před stagingem

Compose: app jen `ingress internal:true`; connector navíc vlastní `egress`; fixed auditovaný subnet/IP a trusted exact connector peer. App nepatří na unrelated network. **Internal bridge odstraní default route, ale stále dovoluje host gateway a peers na stejné bridge**: doloženo lokálním synthetic host-fixture testem200 i na internal bridge. Není to kompletní metadata/host sandbox.

Na skutečném VPS musí člověk navrhnout a nezávisle přezkoumat nftables/ekvivalentní Docker-compatible policy:

- app-origin **NEW egress deny**, pouze ESTABLISHED/RELATED odpovědi na schválený connector→app:3000 provoz;
- host INPUT (gateway/host services), routed FORWARD **před** Docker ACCEPT i **bridge forward** (same-bridge connector/peer), IPv4 aIPv6; nestačí obecná UFW outgoing policy ani pouze DOCKER-USER pro intra-bridge;
- identity app interface/MAC/IP musí zůstat správná po recreate/redeploy; zabránit bypassu přes IPv6/link-local, jinou bridge/gateway a nechat pouze potřebnou ARP/ND infrastrukturu;
- žádný app DNS/internet je v rules potřebný. Connector outbound DNS/UDP-TCP7844 dle ověřených provider requirements; host apt/registry/time jsou zvláštní policy, nikoli app výjimka;
- kernel/bridge conntrack, priority chainů a Docker reload persistence ověřit. Neaplikovat obecné firewall šablony naslepo a nezablokovat SSH/recovery nebo unrelated projects.

Staging musí dokázat odmítnutí app→metadata IPv4/IPv6, host gateway/SSH/admin HTTP, connector NEW a unrelated-net; úspěšný ingress a health/reply flow. Testovat pouze vlastní syntetické endpoints, nesbírat skutečné metadata credentials. Po container recreate/reboot/Docker upgrade retest + firewall counters. Neprojde-li test, public/staging vstup zůstává zavřený. Tento projekt dosud **nemá aplikovanou ani potvrzenou VPS firewall konfiguraci**; runbook není enforcement.

## Adresáře a source identity

```text
/opt/verimtomu/                    root-owned0700, lidský admin
  source/                         read-only remote, bez secrets
  app/<commit>.<random>/           fresh approved Git archive
    image-id                      captured immutable sha256 ID
    release-manifest              commit/tree/image ID/pinned base IDs
  compose.yaml
  scripts/{common,deploy,rollback,build-connector}.sh
  env/app.env                     0600, strict rules template
  env/deployment.env              0600, immutable app/connector IDs + pinned bases/IPAM
  secrets/cloudflared-token       jediný secret pro connector
  previous-image                  předchozí schválený immutable app ID
  release.lock                    flock pouze tohoto projektu
  backups/                        šifrovaný config/source identity, bez user content
```

Všechny placeholder values musí dodat/auditovat člověk. `VERIM_APP_IMAGE=sha256:<64hex-image-id>`, `VERIM_CLOUDFLARED_IMAGE=sha256:<64hex-image-id>`; ne tag připomínající SHA. Source/build/runtime/vendor bases z template mají registry digests. Před první aktivací musí být schváleny app i connector immutable candidates; jejich build/readiness není nasazení. `.env` se nenačítá implicitně, Compose explicitně má vlastní env_file a settings.

Strict app env: production/rules/secure/public origin/exact CF mode + private proxy, body/client2, analysis/client2, analysis/global8, HTTP64; IP burst20/refill20/min, session10/refill10/min, issuance10/refill10/min, global **analysis** burst600/refill600/min; static request burst120/refill120/min a byte burst2MiB/refill2MiB/min. Token bucket burst není garance nejvýše této hodnoty v každém rolling60s intervalu. AI daily/lifetime budgets0, retries0, critic/local/botfalse, žádný known AIkey/NODE_OPTIONS. Guard odmítne drift i při přímém production runtime startu.

## Future approved release/update (teď nespouštět)

Lidský admin ověří clone/remote/exact schválený commit, nainstaluje jeho reviewed Compose/env/helpers mimo source a zazálohuje konfiguraci/pointers. Žádné necommitnuté nebo agent-selected source na production daemonu. Bootstrap/build prostředí nesmí obsahovat prod secrets. Build/test dependency/pinned image provenance a fresh scans schválit zvlášť; Docker admin je root-equivalent trust boundary.

```sh
cd /opt/verimtomu
sudo git -C source fetch origin
sudo git -C source show --no-patch --format=fuller <APPROVED_FULL_COMMIT_SHA>
sudo bash scripts/deploy.sh <APPROVED_FULL_COMMIT_SHA>
sudo bash scripts/build-connector.sh <APPROVED_FULL_COMMIT_SHA>
```

Helpers kontrolují local Docker context/28+, strict pinned settings a full SHA. **Vždy** Git archive→docker build (i když SHA-like tag existuje), `--platform linux/amd64`, captured `--iidfile`; inspect.Id/revision/manifest a production guard bez sítě. BuildKit může znovu použít obsahově identifikované vrstvy; tag není authorization/provenance. App aktivuje pouze captured immutable ID pomocí vlastního Compose project/--no-deps/--pull never/--wait a local smoke. Existing container.Image musí souhlasit se zapsaným pointerem; jinak fail closed. Flock serializuje releasy/rollbacky. Failed start obnoví pouze previous app nebo zastaví vlastní first app; nic nedělá connectoru, DNS, host firewallu či jiným službám.

Connector helper vždy rebuild capture immutable ID a version check bez sítě/tokenu, **nikdy jej neaktivuje a nepřepisuje jeho deployment pointer**. Scan/external approval a root-owned pointer nastaví člověk. Nový token/HTTP-only hostname/edge rules/CF validation je samostatná oprávněná etapa. Žádný automatic deployment workflow není přidán.

Pouze po odděleném schválení člověk může aktivovat vlastní connector, následně local a skutečný HTTPS smoke. `scripts/deployment-smoke.js local` se spouští uvnitř app přes Compose exec, nikoli přes publikovaný loopback port. HTTPS smoke musí běžet z odděleného schváleného klienta/diagnostic egress (app nemá internet route). Ověří rules/zero AI, neutral verdict, __Host cookie/Origin, internal404 a exact WebP delivery integrity/cache/legacy301. Staging navíc H2/H3/duplicates/slow-body, source IP/IPv6/NAT, CF cache/WAF/cold-burst a0.5CPUload.

## Rollback/recovery a provoz

`rollback.sh` bere **immutable** previous-image, inspect.Id a valid revision; aktivuje pouze app a uloží pointer až po smokePASS. Mutable tag nebo mismatched ID fail closed. Image-only rollback **nevrací** Compose/env/helpers/firewall nebo budoucí cost ledger; jejich reviewed recovery plan/backup je zvlášť. Při failed rollback zavřít public vstup a lidsky obnovit ověřenou konfiguraci; nedělat global daemon prune/down. Actual failed-start/failed-rollback/restore drill na VPS stále čeká.

Health30s/5stimeout/retries3, connector local readiness probe, restart unless-stopped pro EXIT/reboot. **Unhealthy sám Docker nerestartuje**; povinný alert/recovery owner a bounded restart policy, protože nekontrolovaný restart resetuje RAM quotas. RAM/CPU/disk/egress/SSL health jen agregovaná metadata, nikdy content/IP/cookie/query labels. Monitoring/retence/restore RTO nejsou doložené. Pravidelně weekly fresh Trivy + official Node-core/Go advisories a reviewed vendor pins, protože npm audit ani Trivy package match nemají úplnou native/core coverage.

Incident: pouze metadata/čas/release, zastavit vlastní public vstup, revokovat dotčené credentials z důvěryhodného zařízení, neotevřít public app port jako workaround. Root compromise znamená nový isolovaný host/recovery/new keys; žádné domácí propojení. AI/upload/URL fetching gates zůstávají zavřené. Žádný deploy/push/CF/DNS změna v této remediation.
