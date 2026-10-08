# Samostatné VPS — human deployment / incident runbook

Tento runbook není autorizace k nasazení. VPS není objednáno, IP/SSH/Cloudflare token nejsou známy. Nejdřív zavřít P0/P1 v SECURITY_RELEASE_GATE.md, independent review a staging, potom výslovné lidské schválení přesného releasu. Nic zde nebylo provedeno na produkci nebo domácím serveru.

## 1. Pořízení a bootstrap

Člověk zvolí OVHcloud/Hetzner nebo jiného poskytovatele, EU region a smluvní zpracování; Ubuntu Server 24.04 LTS amd64, 2 vCPU, 4 GB RAM, 40–80 GB SSD. Zapne MFA/passkey účtu, rozpočtové alerts, recovery console a bezpečné zálohy. Žádné VPC/VPN/Tailscale propojení na domácí projekty. Veřejná IP slouží jen omezené administraci, DNS aplikace bude přes Tunnel. <VPS_IP> a <ADMIN_CIDR> dodá člověk; nejsou odhady.

Admin si na svém důvěryhodném počítači vytvoří chráněný Ed25519 SSH klíč (ideálně hardware-backed), nikdy v agent workspace. Provider root účet jen dočasně pro bootstrap. Na serveru založí verim-admin se sudo pro člověka, nahraje pouze veřejný klíč a ověří druhou SSH relaci i provider console. Agent tento účet/klíč nedostane.

Po kontrole Ubuntu release a disků, člověk spustí:

```sh
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install ca-certificates curl gnupg git ufw unattended-upgrades fail2ban
sudo adduser verim-admin
sudo usermod -aG sudo verim-admin
```

Žádná hesla/tokeny v argv, shell history nebo chatu. Passwordless SSH neznamená passwordless sudo. V /etc/ssh/sshd_config.d/60-verim-hardening.conf (admin kontroluje i případná provider pravidla): PermitRootLogin no, PasswordAuthentication no, KbdInteractiveAuthentication no, PubkeyAuthentication yes, X11Forwarding no, AllowTcpForwarding no, MaxAuthTries 3, AllowUsers verim-admin. Nezakázat password/root před funkčním novým klíčem a recovery console. sudo sshd -t; sudo sshd -T pro efektivní nastavení; potom sudo systemctl reload ssh a otestovat NOVOU relaci, stávající ponechat otevřenou.

Host/provider firewall IPv4 I IPv6: default deny inbound, allow established; TCP 22 pouze <ADMIN_CIDR> a případný výslovný recovery CIDR. Nikde neotevírat 3000 nebo 43127, není nutné otevřít 80/443 na VPS — TLS je na Cloudflare. Host pravidla provede člověk až po dodání skutečného source CIDR:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <ADMIN_CIDR> to any port 22 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Placeholder není spustitelná hodnota. Fail2ban je doplněk, ne náhrada klíčů/MFA/source firewallu. Docker publikované ports mohou obcházet UFW: právě proto jen explicitní loopback a Docker 28+, plus provider firewall a external IPv4/IPv6 port scan. Žádné široké DOCKER-USER zásahy bez vlastního síťového testu.

Egress aktuálně vyžaduje DNS UDP/TCP 53, čas UDP 123, apt/registry HTTPS 443 (apt může vyžadovat 80) a Tunnel UDP/TCP 7844. App bridge má outbound NAT; dnes nevykonává user-selected fetch. To není egress sandbox. Budoucí fetch/upload workers mají samostatný deny-private/metadata egress gate. Žádné důvěryhodné služby zařazované na app bridge.

## 2. Docker, patching a host baseline

Docker Engine 28+ a Compose v2 z oficiální Ubuntu apt repository, nikoli curl | sh. Člověk následuje https://docs.docker.com/engine/install/ubuntu/ , ověří signing key/fingerprint podle oficiálního zdroje a před instalací zkontroluje konfliktní balíčky. Na novém čistém VPS lze připravit:

```sh
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl --fail --show-error --silent --location https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
gpg --show-keys --with-fingerprint /etc/apt/keyrings/docker.asc
# Teprve po ověření klíče, vytvořit /etc/apt/sources.list.d/docker.sources:
# Types: deb
# URIs: https://download.docker.com/linux/ubuntu
# Suites: noble
# Components: stable
# Architectures: amd64
# Signed-By: /etc/apt/keyrings/docker.asc
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker version
sudo docker compose version
```

Nedávat agenty do docker/sudo skupiny. Docker socket je prakticky root oprávnění; ani build z cizího PR nesmí běžet na produkčním hostu. Pro první beta release spouští lokální release skripty člověk jako admin s výslovným sudo, žádný Docker TCP endpoint. Stejný účet nesmí hostit jiné projekty.

Nastavit unattended security updates pro Ubuntu, plánované kernel/Docker reboot maintenance, NTP, journald retenci, disable core dumps, šifrovaný swap pokud potřebný. Pinnované Node/distroless/cloudflared images se apt aktualizací nezmění: týdenní advisory/Trivy kontrola, nové ověřené digesty v PR a nový schválený release. Kernel/docker/image update po stagingu, při aktivně exploitované kritické zranitelnosti uzavřít public hostname do opravy.

## 3. Adresáře a konfigurace

```text
/opt/verimtomu/                 root-owned, 0700; pouze člověk admin
  source/                      Git mirror/checkout, read-only remote, bez secrets
  app/<SHA>.<random>/           Git archive přesného schváleného SHA
  compose.yaml                 schválená verze deploy/compose.yaml
  scripts/{common,deploy,rollback,build-connector}.sh
  env/app.env                  0600, kopie app.env.example, bez AI klíče
  env/deployment.env           0600, pinned images, IPAM a release pointer
  secrets/cloudflared-token    owner 65532:65532, mode 0400
  previous-image               předchozí schválený app tag
  release.lock                 flock lock jen projektu
  backups/                     šifrované exporty, off-host kopie
```

Parent secret dir zůstává restricted root; Docker daemon otevře mount, connector čte jediný file s UID 65532. Compose file secret používá bind mount, uid/gid/mode deklarace nemusí být vynucena — ověřit skutečný owner/mode. Token nevypisovat cat, v docker inspect celé Config.Env, v process args, v Git ani app image. Token patří pouze novému tunnelu; žádný jiný projekt/token se nepoužije.

Před prvním startem správce zkontroluje ip -4/-6 route a docker network inspect vybraných sítí; zvolí volný RFC1918 /29 s odlišnými adresami gateway, app a ingress, žádná kolize s provider sítí. Příklad lokálních testů není VPS nastavení. GUARD_TRUSTED_PROXY_IP musí být přesně VERIM_INGRESS_IP. Nezapnout obecný trusted CIDR.

app.env přesně podle template: NODE_ENV=production, HOST=0.0.0.0 (uvnitř kontejneru), PORT=3000, AI_MODE=rules, Secure true, public origin https://verimtomu.fyi, IP20/min/session10/min/global API600/min, HTTP64 a analýza8; všechny AI daily/total limity 0, retry0/criticfalse/localfalse/botfalse. .env není automaticky načten; Compose explicitně používá vlastní env files. Žádný AI secret nebo DB volume v této fázi.

deployment.env: VERIM_APP_IMAGE=verimtomu:<approved full 40-hex SHA>, VERIM_NODE_IMAGE pinned build/test image, VERIM_RUNTIME_IMAGE pinned distroless runtime, VERIM_CLOUDFLARED_IMAGE=verimtomu-cloudflared:<approved full SHA>, VERIM_CLOUDFLARED_SOURCE_IMAGE pinned vendor digest, VERIM_CONNECTOR_RUNTIME_IMAGE pinned distroless-static digest, VERIM_NETWORK_SUBNET/APP_IP/INGRESS_IP z auditu. Nenahrazovat releasy plovoucím latest. Connector používá bajtově totožný staticky linkovaný Go binary; nepotřebné vendor OpenSSL knihovny nejsou v runtime. CA certifikáty zůstávají.

## 4. Release workflow a konkrétní příkazy

Codex/Claude izolovaný ephemeral workspace → automatizované testy/scan → nezávislý security review jiným člověkem → staging se syntetickými daty a odděleným tunnelem/tokenem → lidské schválení commit SHA/image digest a uzavřeného gate → omezený deployment člověkem → production smoke. Public uživatelský obsah nesmí spouštět agent task, build, změnu konfigurace ani deployment.

Žádný agent nesmí mít produkční SSH/root/sudo/Docker socket, Cloudflare API/tunnel token, AI secret nebo deploy permission. CI případně contents:read, žádné secrets, žádný pull_request_target s kódem forků, pinned actions, bez self-hosted production runneru; branch protection/CODEOWNERS/two-person review nastavuje člověk. Automatický deploy workflow zatím neexistuje a nebyl přidán. Build i testy pouze v izolovaném builderu bez prod sítě/secrets; publish/deploy oddělená schválená identita. Build-stage tests používají network none (loopback syntetické fixtures fungují).

Repo aktuálně nemá HEAD commit: člověk musí nejdřív nechat kompletní změny přezkoumat a výslovně schválit commit. Push nebyl proveden. Na VPS clone/fetch používá lidskou read-only Git identitu, ne agent token, nikdy přihlašovací údaj v URL. Necommitovat env nebo token.

Po schválení a připravení source/config člověk provede:

```sh
cd /opt/verimtomu
# Fetch neprovádí deploy.sh; člověk nejprve ověří remote a schválený commit.
sudo git -C source fetch --prune origin
sudo git -C source show --no-patch --format=fuller <APPROVED_FULL_COMMIT_SHA>
sudo bash scripts/deploy.sh <APPROVED_FULL_COMMIT_SHA>
sudo bash scripts/build-connector.sh <APPROVED_FULL_COMMIT_SHA>
```

Skript ověří local Docker context, Engine28+, pinned allowed images, exact SHA a OCI revision, exportuje commit do fresh dir, nebuduje working tree nebo secrets, builduje/testuje image, zkouší rules guard bez sítě, aktivuje jen app --no-deps --pull never --wait a local smoke. Flock brání souběhu deploymentu/rollbacku. Neúspěšný start vrátí předchozí app nebo zastaví první nefunkční app. Connector nespouští/restartuje; local PASS ještě není public release.

Connector build pouze připraví image bez sítě/tokenu a ověří version/OCI SHA; scan/review a skutečné HTTPS/Tunnel ověření je samostatný gate. VERIM_CLOUDFLARED_IMAGE v deployment.env nastaví člověk na přesný schválený connector release. App deployment/rollback tento pointer sám nemění. Teprve po lidském nastavení nového tokenu/hostname/DNS:

```sh
cd /opt/verimtomu
sudo docker compose --project-name verimtomu --env-file env/deployment.env -f compose.yaml --profile cloudflare up -d --no-deps cloudflared
sudo docker compose --project-name verimtomu --env-file env/deployment.env -f compose.yaml ps
sudo docker compose --project-name verimtomu --env-file env/deployment.env -f compose.yaml exec -T app node scripts/deployment-smoke.js local
```

HTTPS smoke z omezeného klienta mimo origin, nebo z vlastní egress sítě s již schválenou app image:

```sh
sudo docker run --rm --network verimtomu_egress --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --memory 256m --cpus 0.25 --pids-limit 32 \
  <APPROVED_APP_IMAGE> node scripts/deployment-smoke.js https
```

Ověří rules, privacy/home/static, 14 přesných PNG, interní 404, Secure session, správný Origin a odmítnutí CSRF. Přidat živé TLS/HTTP redirect/HSTS, spoof-IP kvóty, dvě různé IP, externí scan VPS ports a browser desktop/390/320. Syntetické zprávy, žádné soukromé SMS. Staging veřejný endpoint není určený pro skutečná data, je omezený přístupem člověka; nový staging origin vyžaduje schválenou staging-specific konfiguraci, produkční guard pevně zamyká canonical origin.

Update: stejné fetch/review/scan/exact SHA/deploy/smoke. Compose/env/scripts jsou versioned config mimo image: před změnou zálohovat a instalovat pouze schválené soubory root-owned. Image-only rollback je neumí automaticky rewindovat. Nemažte previous image před potvrzením releasu, žádný global docker prune. Výpadek je možný; nejde o zero-downtime rollout.

## 5. Rollback, backup a obnova

```sh
cd /opt/verimtomu
sudo bash scripts/rollback.sh
sudo docker compose --project-name verimtomu --env-file env/deployment.env -f compose.yaml exec -T app node scripts/deployment-smoke.js local
```

Rollback aktivuje jen verimtomu app z previous-image s ověřeným OCI SHA, stejným env/Compose a smoke; potom zopakovat HTTPS smoke. Nikdy cizí projekt, global daemon, síť nebo data. Při prvním releasu bez previous image lze zastavit jen vlastní app/connector. Pokud selže rollback health/smoke, není označen jako PASS; incident admin zastaví public vstup a zvolí poslední ověřenou konfiguraci/image.

Před každou config změnou: šifrovaný archive vlastního compose/env/scripts a release pointers, uložit vlastní image digest a schválený source commit. Rebuild ze SHA se stejnými pinned images je hlavní obnova; off-host backup configu, secrets odděleně. Token po ztrátě obnovit vydáním nového, ne nešifrovaným server snapshotem. Aktuálně není uživatelská DB ani soubory k záloze. Budoucí budget ledger je persistentní a nesmí se běžným rollbackem vrátit na nižší rezervace.

Obnovovací drill na novém izolovaném staging VPS: čistý bootstrap, config restore, nový staging token, image rebuild/verification, rules guard/health/smoke, bez reálných dat. Cílové RPO config do posledního schváleného releasu; orientační RTO 4 h musí potvrdit cvičení, zatím není prokázáno. Single VPS nemá HA. Cloudflare outage se řeší čekáním/transparentní informací; nikdy otevřením veřejného portu app.

## 6. Monitoring, rotace a incident

App health 30 s, /api/health validuje rules/ai_configured=false. Connector ready probe přes privátní localhost metrics, žádný veřejný metrics port. restart unless-stopped obnoví EXIT procesu/host restart, ale samotný unhealthy stav Docker automaticky nerestartuje. Alarm na unhealthy/restart count, RAM/OOM/CPU/disk, TLS/domain expiry, syntetický HTTPS check každou minutu z odděleného omezeného monitoru. Alarm metadata bez body/IP/cookie/query. Auto-restart loop při útoku může resetovat kvóty; nezařazovat autoheal s Docker socketem. Monitoring není dosud zaveden na VPS, je release gate.

Token rotation: člověk vydá nový pouze tomuto tunnelu, bezpečně atomicky nahradí vlastní secret file se stejnými právy a force-recreate pouze cloudflared. Zkontroluje connected/ready + HTTPS, revokuje starý token. Cloudflare admin/API credentials zůstávají mimo app/server, scoped a MFA, pravidelně auditovat. Budoucí AI klíč se revokuje u providera, nikdy „rotace“ paste do repo. Session HMAC v rules se obnoví restartem, staré cookies získají novou session.

Incident: zaznamenat jen metadata/čas/release; při podezření na únik okamžitě edge block POST nebo vypnout pouze vlastní connector/app, revokovat odpovídající token/klíče z jiného důvěryhodného zařízení. AI/upload/URL gates zůstávají zavřené. Zachovat minimalizované audit artefakty bez content; nezapínat debug nebo heap dump. Pokud kompromitován root, nečistit „na místě“: izolovat VPS provider firewallem, bootstrap nového VPS, nové SSH/tunnel credentials a prověřený release, obnovit jen ověřenou konfiguraci. Prověřit účty/registry/Git/backup, právní notifikace podle dopadu, independent review a nový gate před otevřením. Domácí server se incidentu neúčastní.
