#!/usr/bin/env bash
# Stage 10/11: deploy the admin dashboard (Search Console OAuth, Stage 11 tabs) to staging.verimtomu.fyi only.
# Run manually on the VPS as root from a clean checkout. Phases (in this order):
#   preflight  read-only checks of the running staging container, backups, egress to Google
#   build      build the new admin image from this checkout; offline tests and start-up smoke
#   authorize  one-time Google consent through an SSH tunnel (interactive; gsc-oauth-authorize.sh)
#   deploy     replace ONLY verimtomu-admin-staging, keeping network, IP, volume, mounts and limits;
#              the old container is kept stopped as verimtomu-admin-staging-pre10 (instant rollback)
#   verify     container, Access, dashboard, Search Console sync, production untouched
#   upgrade    replace an already deployed Stage 10 container with the image of $COMMIT (same
#              derivation); the previous one is kept stopped as verimtomu-admin-staging-prev
#   diagnose   read-only Search Console diagnostics inside the running container (structure only)
#   rollback   back to the old container (or, if it was removed, to verimtomu-admin:pre-stage10)
#   rollback-upgrade  back to the container replaced by `upgrade`
#   finalize   remove the stopped old containers (the pre-stage10 image is kept)
# The new container is derived from `docker inspect` of the running one, so nothing of its real
# configuration is retyped; unexpected settings stop the script instead of being dropped.
# Never prints environment values, the OAuth client or the refresh token. Production web, its
# containers, Cloudflare Tunnel and databases are only read (preflight snapshot, verify).
set +x
set -euo pipefail
umask 077

CONTAINER=verimtomu-admin-staging
OLD=$CONTAINER-pre10
PREV=$CONTAINER-prev
NETWORK=verimtomu-admin-stage1
IP=172.30.42.2
VOLUME=verimtomu-admin-stage1-data
PRE_IMAGE=verimtomu-admin:pre-stage10
COMMIT=0ca85592882bc00a0226a8a36a6475fca711f6f6
NEW_IMAGE=verimtomu-admin:stage10-${COMMIT:0:7}
TOKEN=/opt/verimtomu/admin-secrets/gsc-oauth.json
TOKEN_MOUNT=/run/secrets/gsc-oauth.json
SITE_URL=${GSC_SITE_URL:-sc-domain:verimtomu.fyi}
BACKUPS=/root/verimtomu-backups
STATE=$BACKUPS/stage10-deploy
ISSUER_HOST=aged-brook-5b74.cloudflareaccess.com
AUD=59d367496ef9ffd92f8060caee18ea1631a7d9c5638a2a6cb3c6f08559ff7456
STAGING=https://staging.verimtomu.fyi

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/.." && pwd)
say(){ printf '%s\n' "$*"; }
ok(){ printf '  OK    %s\n' "$*"; }
fail(){ printf '  CHYBA %s\n' "$*" >&2; exit 1; }
exists(){ docker container inspect "$1" >/dev/null 2>&1; }
running(){ [[ $(docker container inspect -f '{{.State.Running}}' "$1" 2>/dev/null) == true ]]; }

# Python helper: reads `docker inspect` JSON. Modes:
#   check <inspect.json>                         facts + violations of the expected staging setup
#   args  <inspect.json> <image-env.json> <new|restore> <env-file> <token> <site>
#         → NUL-separated `docker run` arguments on stdout, environment written to <env-file> (0600)
py(){ python3 - "$@" <<'PY'
import json,sys
mode=sys.argv[1];d=json.load(open(sys.argv[2]));d=d[0] if isinstance(d,list) else d
hc,cfg=d['HostConfig'],d['Config']
NETWORK,IP,VOLUME='verimtomu-admin-stage1','172.30.42.2','verimtomu-admin-stage1-data'
nets=d['NetworkSettings']['Networks'] or {}
problems=[]
def need(cond,msg):
  if not cond: problems.append(msg)
net=list(nets.items())
need(len(net)==1,'expected exactly one network')
name,info=(net[0] if net else ('',{}))
ip=((info.get('IPAMConfig') or {}).get('IPv4Address') or '')
need(name==NETWORK,'network is not '+NETWORK)
need(ip==IP,'no fixed IPv4 '+IP)
need(hc.get('NetworkMode')==NETWORK,'network mode differs')
need(hc.get('ReadonlyRootfs') is True,'root filesystem not read-only')
need('ALL' in (hc.get('CapDrop') or []),'cap_drop ALL missing')
need(not hc.get('CapAdd'),'capabilities added')
need(any(s.startswith('no-new-privileges') for s in hc.get('SecurityOpt') or []),'no-new-privileges missing')
need(hc.get('Memory')==192*1024*1024,'memory limit is not 192 MB')
need(hc.get('PidsLimit')==64,'PID limit is not 64')
need(not hc.get('Privileged'),'privileged')
need(not hc.get('PortBindings'),'published ports present')
for k in ('Devices','ExtraHosts','Dns','Ulimits','Links','VolumesFrom','DeviceRequests'):
  need(not hc.get(k),k+' set (unsupported by this script)')
need(not hc.get('Init'),'init set (unsupported)')
mounts=d.get('Mounts') or []
for m in mounts:
  need(m['Type'] in ('bind','volume'),'unsupported mount type '+m['Type'])
  need(',' not in (m.get('Source') or '')+m['Destination'],'comma in mount path')
data=[m for m in mounts if m['Destination']=='/data']
need(len(data)==1 and data[0]['Type']=='volume' and data[0].get('Name')==VOLUME and data[0]['RW'],'/data is not the volume '+VOLUME+' (rw)')
cf=[m for m in mounts if m.get('Source')=='/opt/verimtomu/admin-secrets/cloudflare-token']
need(len(cf)==1 and not cf[0]['RW'],'Cloudflare token not mounted read-only')
ue=[m for m in mounts if (m.get('Source') or '').startswith('/opt/verimtomu/usage-export')]
need(len(ue)==1 and not ue[0]['RW'],'usage export not mounted read-only')
if mode=='check':
  cpus=(hc.get('NanoCpus') or 0)/1e9
  print('  fakta: síť',name,ip,'| paměť',(hc.get('Memory') or 0)//1048576,'MB | CPU',cpus or 'bez limitu','| PID',hc.get('PidsLimit'),
        '| restart',hc['RestartPolicy']['Name'],'| read-only',hc.get('ReadonlyRootfs'),'| mounty',len(mounts))
  for m in mounts: print('  mount:',m['Type'],m.get('Name') or m.get('Source'),'->',m['Destination'],'rw' if m['RW'] else 'ro')
  gsc=[m for m in mounts if m['Destination']=='/run/secrets/gsc-oauth.json']
  if gsc: print('  pozn.: GSC mount už existuje')
  for p in problems: print('  PROBLEM:',p)
  sys.exit(1 if problems else 0)
if problems:
  for p in problems: print('PROBLEM: '+p,file=sys.stderr)
  sys.exit(1)
image_env=set(json.load(open(sys.argv[3])) or [])
kind,env_file,token,site=sys.argv[4],sys.argv[5],sys.argv[6],sys.argv[7]
a=[]
rp=hc['RestartPolicy'];a+=['--restart',rp['Name']+(':'+str(rp['MaximumRetryCount']) if rp['Name']=='on-failure' and rp.get('MaximumRetryCount') else '')] if rp.get('Name') else []
a+=['--read-only']
for c in hc.get('CapDrop') or []: a+=['--cap-drop',c]
for s in hc.get('SecurityOpt') or []: a+=['--security-opt',s]
a+=['--memory',str(hc['Memory'])]
if hc.get('MemorySwap'): a+=['--memory-swap',str(hc['MemorySwap'])]
if hc.get('NanoCpus'): a+=['--cpus',repr(hc['NanoCpus']/1e9)]
elif hc.get('CpuQuota'): a+=['--cpu-quota',str(hc['CpuQuota']),'--cpu-period',str(hc.get('CpuPeriod') or 100000)]
a+=['--pids-limit',str(hc['PidsLimit'])]
for k,v in (hc.get('Tmpfs') or {}).items(): a+=['--tmpfs',k+(':'+v if v else '')]
lc=hc.get('LogConfig') or {}
if lc.get('Type'):
  a+=['--log-driver',lc['Type']]
  for k,v in (lc.get('Config') or {}).items(): a+=['--log-opt',k+'='+v]
if cfg.get('User'): a+=['--user',cfg['User']]
for m in mounts:
  if m['Destination']=='/run/secrets/gsc-oauth.json': continue
  src=m['Name'] if m['Type']=='volume' else m['Source']
  a+=['--mount','type=%s,src=%s,dst=%s%s'%(m['Type'],src,m['Destination'],'' if m['RW'] else ',readonly')]
if kind=='new': a+=['--mount','type=bind,src=%s,dst=/run/secrets/gsc-oauth.json,readonly'%token]
a+=['--network',NETWORK,'--ip',IP]
env=[e for e in (cfg.get('Env') or []) if e not in image_env and not e.startswith('GSC_')]
if kind=='new': env+=['GSC_CREDENTIALS_FILE=/run/secrets/gsc-oauth.json','GSC_SITE_URL='+site]
for e in env:
  if '\n' in e or '=' not in e: print('PROBLEM: unsupported environment entry',file=sys.stderr);sys.exit(1)
with open(env_file,'w') as f: f.write(''.join(e+'\n' for e in env))
a+=['--env-file',env_file]
sys.stdout.write('\0'.join(a)+'\0')
PY
}

checkout_ok(){
  git -C "$repo" cat-file -e "$COMMIT^{commit}" 2>/dev/null || fail "commit ${COMMIT:0:7} v checkoutu chybí"
  [[ -z $(git -C "$repo" status --porcelain) ]] || fail 'checkout není čistý'
  # The image contents (Dockerfile, package files, src, public) must be exactly those of the approved commit.
  for p in admin/Dockerfile admin/package.json admin/package-lock.json admin/src admin/public admin/tools; do
    [[ $(git -C "$repo" rev-parse "HEAD:$p") == $(git -C "$repo" rev-parse "$COMMIT:$p") ]] || fail "$p se liší od ${COMMIT:0:7}"
  done
  ok "checkout čistý; obsah image odpovídá ${COMMIT:0:7}"
}

snapshot_production(){ # every container except the admin staging ones: name, id, start time
  { docker ps -a --format '{{.Names}}' | grep -vE "^($CONTAINER|$OLD|$PREV|$CONTAINER-failed-.*|verimtomu-gsc-oauth|verimtomu-admin-s10-smoke)$" || true; } | sort | while read -r n; do
    docker container inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.State.Status}}' "$n"; done
  systemctl is-active cloudflared.service 2>/dev/null | sed 's/^/cloudflared.service /' || true
}

egress(){ # HTTPS reachability of a Google host from the admin network (any HTTP answer counts)
  docker run --rm --network "$NETWORK" --read-only --cap-drop ALL --security-opt no-new-privileges:true --memory 64m --pids-limit 32 \
    --entrypoint node "$1" -e "fetch('$2',{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)}).then(r=>console.log(r.status),()=>{console.log('ERR');process.exitCode=1})"
}

preflight(){
  say '== Preflight (jen čtení)'
  [[ $(id -u) -eq 0 ]] || fail 'spusťte jako root'
  for c in docker python3 git curl; do command -v $c >/dev/null || fail "chybí $c"; done
  checkout_ok
  running "$CONTAINER" || fail "$CONTAINER neběží"
  if exists "$OLD"; then say "  info  $OLD existuje (Stage 10 už nasazen): pro novou verzi použijte upgrade, rollback vede na $OLD"; fi
  if exists "$PREV"; then running "$PREV" && fail "$PREV běží"; say "  info  $PREV existuje (zastavený po předchozím upgrade); upgrade ho nahradí"; fi
  mkdir -p "$STATE"; chmod 0700 "$BACKUPS" "$STATE"
  docker container inspect "$CONTAINER" > "$STATE/preflight.inspect.json"
  py check "$STATE/preflight.inspect.json" || fail 'konfigurace kontejneru neodpovídá očekávání (viz PROBLEM)'
  ok 'síť, pevná IP, volume, mounty a bezpečnostní omezení odpovídají'
  docker image inspect "$PRE_IMAGE" >/dev/null 2>&1 || fail "chybí image $PRE_IMAGE"
  cur=$(docker container inspect -f '{{.Image}}' "$CONTAINER"); pre=$(docker image inspect -f '{{.Id}}' "$PRE_IMAGE")
  [[ $cur == "$pre" ]] && ok "běžící kontejner používá $PRE_IMAGE" || say "  POZOR běžící kontejner NEpoužívá $PRE_IMAGE (rollback vrátí stávající kontejner; $PRE_IMAGE je až druhá záloha)"
  for f in "$BACKUPS/admin-stage10-backup.sqlite" "$BACKUPS/admin-data-pre-stage10.tar.gz"; do [[ -s $f ]] || fail "chybí záloha $f"; done
  ok 'zálohy existují'
  docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' "$NETWORK" | grep -qx '172.30.42.0/24' && ok "síť $NETWORK 172.30.42.0/24" || fail 'subnet sítě neodpovídá'
  [[ -e $TOKEN ]] && say "  info  refresh token už existuje ($(stat -c '%a %u:%g' "$TOKEN"))" || say '  info  refresh token zatím neexistuje → fáze authorize'
  if command -v ss >/dev/null && ss -ltn 'sport = :8765' | grep -q 8765; then fail 'port 8765 na VPS je obsazený'; fi
  for u in https://oauth2.googleapis.com/token https://searchconsole.googleapis.com/; do
    h=${u#https://}; h=${h%%/*}
    r=$(egress "$PRE_IMAGE" "$u" || true); [[ $r =~ ^[0-9]+$ ]] && ok "egress ze sítě adminu na $h: HTTP $r" || fail "kontejner na síti $NETWORK nedosáhne $h (firewall/egress)"
  done
  snapshot_production > "$STATE/production.before"; ok "snapshot produkce: $(wc -l < "$STATE/production.before") záznamů (jen čtení)"
  r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "$STAGING/api/seo?days=28")
  [[ $r == 302\ https://$ISSUER_HOST/* && $r == *"kid=$AUD"* ]] && ok 'Access: anonymní požadavek → 302 login, AUD sedí' || fail "Access neodpovídá očekávání: ${r%% *}"
  say 'Preflight OK.'
}

build(){
  say "== Build $NEW_IMAGE (běžící kontejner se nemění)"
  checkout_ok
  mkdir -p "$STATE"; chmod 0700 "$BACKUPS" "$STATE"
  # Build context = exactly the approved commit (git archive), with normal file modes: a checkout made
  # under umask 077 would otherwise give an image whose files the non-root user cannot read.
  ctx=$STATE/build-$COMMIT; rm -rf "$ctx"
  (umask 022; mkdir -p "$ctx"; git -C "$repo" archive "$COMMIT" admin | tar -x --no-same-owner -C "$ctx")
  [[ -f $ctx/admin/Dockerfile ]] || fail 'git archive selhal'
  docker build --pull=false -t "$NEW_IMAGE" --label org.verimtomu.commit="$COMMIT" "$ctx/admin"
  docker run --rm --network none --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m --cap-drop ALL --security-opt no-new-privileges:true \
    --memory 192m --pids-limit 64 -v "$ctx/admin/tests":/admin/tests:ro -v "$ctx/admin/tools":/admin/tools:ro \
    --entrypoint sh "$NEW_IMAGE" -c 'cd /admin && node --test tests/*.test.js' > "$STATE/build-tests.log" 2>&1 || true
  t=$(grep -E '^ℹ (tests|pass|fail) ' "$STATE/build-tests.log" | tr '\n' ' ')
  grep -q '^ℹ fail 0$' "$STATE/build-tests.log" && ok "unit testy v novém image (Node 24, bez sítě): $t" || fail "unit testy: $t (viz $STATE/build-tests.log)"
  local n=verimtomu-admin-s10-smoke
  docker rm -f "$n" >/dev/null 2>&1 || true
  docker run -d --name "$n" --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m --cap-drop ALL --security-opt no-new-privileges:true \
    --memory 192m --pids-limit 64 -e ACCESS_ISSUER="https://$ISSUER_HOST" -e ACCESS_AUDIENCE="$AUD" -e ADMIN_HOSTNAME=staging.verimtomu.fyi -e ADMIN_DB_PATH=/tmp/a.sqlite "$NEW_IMAGE" >/dev/null
  sleep 4
  docker logs "$n" 2>&1 | grep -q 'Admin dashboard started.' && ok 'start bez GSC a bez sítě' || { docker rm -f "$n" >/dev/null; fail 'smoke start selhal'; }
  s=$(docker exec "$n" node -e "fetch('http://127.0.0.1:3100/api/seo?days=28',{headers:{Host:'staging.verimtomu.fyi'}}).then(r=>console.log(r.status))")
  docker rm -f "$n" >/dev/null; [[ $s == 403 ]] && ok 'bez JWT 403' || fail "bez JWT $s"
  rm -rf "$ctx"
  say "Build OK: $NEW_IMAGE ($(docker image inspect -f '{{.Id}}' "$NEW_IMAGE" | cut -c1-19))"
}

authorize(){
  [[ ! -e $TOKEN ]] || { ok "refresh token už existuje ($(stat -c '%a %u:%g' "$TOKEN")); nic se nemění"; return; }
  [[ -n ${1:-} ]] || fail 'zadejte cestu k JSON OAuth klienta: authorize /root/gsc-oauth-client.json'
  checkout_ok
  # Run the approved commit's tool from a git-archive copy with normal file modes (readable by UID 1000).
  mkdir -p "$STATE"; chmod 0700 "$BACKUPS" "$STATE"
  local ctx=$STATE/authorize-$COMMIT; rm -rf "$ctx"
  (umask 022; mkdir -p "$ctx"; git -C "$repo" archive "$COMMIT" admin | tar -x --no-same-owner -C "$ctx")
  local rc=0; bash "$ctx/admin/gsc-oauth-authorize.sh" "$1" || rc=$?
  rm -rf "$ctx"
  [[ $rc == 0 ]] && token_ok || fail 'autorizace nedokončena; nic se nezměnilo (běžící kontejner beze změny)'
}

token_ok(){
  [[ -f $TOKEN && ! -L $TOKEN ]] || fail "chybí $TOKEN (nejdřív authorize)"
  [[ $(stat -c '%a %u:%g' "$TOKEN") == '400 1000:1000' ]] || fail "$TOKEN nemá 0400 1000:1000"
  ok 'refresh token: 0400 1000:1000'
}

http_status(){ # status of an unauthenticated request inside the container (403 = listening, JWT enforced)
  docker exec "$1" node -e "fetch('http://127.0.0.1:3100/api/seo?days=28',{headers:{Host:'staging.verimtomu.fyi'},signal:AbortSignal.timeout(3000)}).then(r=>console.log(r.status),()=>console.log('ERR'))" 2>/dev/null || echo ERR
}
wait_started(){ # container name, seconds. Logs of a restarted container still hold old lines, so ask HTTP.
  for _ in $(seq 1 "$2"); do running "$1" || return 1; [[ $(http_status "$1") == 403 ]] && return 0; sleep 1; done; return 1
}

swap_back(){ # stop the new container, bring the old one back under the original name
  local ts; ts=$(date +%Y%m%d%H%M%S)
  if exists "$CONTAINER"; then docker stop -t 10 "$CONTAINER" >/dev/null || true; docker rename "$CONTAINER" "$CONTAINER-failed-$ts"; docker update --restart=no "$CONTAINER-failed-$ts" >/dev/null; fi
  if exists "$OLD"; then
    docker rename "$OLD" "$CONTAINER"
    docker update --restart="$(cat "$STATE/restart.policy")" "$CONTAINER" >/dev/null
    docker start "$CONTAINER" >/dev/null
  else
    say "  starý kontejner neexistuje; vytvářím ho z $PRE_IMAGE podle uloženého inspect"
    [[ -s $STATE/pre10.inspect.json ]] || fail 'chybí uložený inspect'
    docker image inspect -f '{{json .Config.Env}}' "$PRE_IMAGE" > "$STATE/image.env.json"
    mapfile -d '' args < <(py args "$STATE/pre10.inspect.json" "$STATE/image.env.json" restore "$STATE/restore.env" "$TOKEN" "$SITE_URL")
    docker run -d --name "$CONTAINER" "${args[@]}" "$PRE_IMAGE" >/dev/null
    shred -u "$STATE/restore.env" 2>/dev/null || rm -f "$STATE/restore.env"
  fi
  wait_started "$CONTAINER" 30 && [[ $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'Host: staging.verimtomu.fyi' "http://$IP:3100/") == 403 ]] && ok "rollback: $CONTAINER běží, http://$IP:3100 bez JWT 403 ($(docker container inspect -f '{{.Config.Image}} {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$CONTAINER"))" || fail 'rollback: kontejner nenastartoval'
}

deploy(){
  say '== Deploy (mění jen verimtomu-admin-staging)'
  [[ $(id -u) -eq 0 ]] || fail 'spusťte jako root'
  [[ -s $STATE/production.before ]] || fail 'nejdřív preflight'
  docker image inspect "$NEW_IMAGE" >/dev/null 2>&1 || fail 'nejdřív build'
  [[ $(docker image inspect -f '{{index .Config.Labels "org.verimtomu.commit"}}' "$NEW_IMAGE") == "$COMMIT" ]] || fail 'image není z očekávaného commitu'
  token_ok
  running "$CONTAINER" || fail "$CONTAINER neběží"; ! exists "$OLD" || fail "$OLD už existuje"
  docker container inspect "$CONTAINER" > "$STATE/pre10.inspect.json"
  py check "$STATE/pre10.inspect.json" >/dev/null || fail 'konfigurace se od preflightu změnila'
  docker container inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$CONTAINER" > "$STATE/restart.policy"
  docker image inspect -f '{{json .Config.Env}}' "$(docker container inspect -f '{{.Image}}' "$CONTAINER")" > "$STATE/image.env.json"
  mapfile -d '' args < <(py args "$STATE/pre10.inspect.json" "$STATE/image.env.json" new "$STATE/new.env" "$TOKEN" "$SITE_URL")
  [[ ${#args[@]} -gt 10 ]] || fail 'nelze odvodit parametry kontejneru'
  ok "parametry odvozeny z běžícího kontejneru (${#args[@]} argumentů; prostředí jen v souboru 0600)"
  docker stop -t 20 "$CONTAINER" >/dev/null
  docker rename "$CONTAINER" "$OLD"
  docker update --restart=no "$OLD" >/dev/null   # never competes for the IP after a reboot
  ts=$(date +%Y%m%d%H%M%S); docker cp "$OLD:/data" "$STATE/data-pre-swap-$ts" && ok "kopie /data po zastavení: $STATE/data-pre-swap-$ts"
  ok "starý kontejner zastaven a ponechán jako $OLD"
  if ! docker run -d --name "$CONTAINER" "${args[@]}" "$NEW_IMAGE" >/dev/null; then
    shred -u "$STATE/new.env" 2>/dev/null || true; say '  start nového kontejneru selhal → rollback'; swap_back; fail 'nasazení vráceno'
  fi
  shred -u "$STATE/new.env" 2>/dev/null || rm -f "$STATE/new.env"
  if ! wait_started "$CONTAINER" 60 || docker logs "$CONTAINER" 2>&1 | grep -q 'Search Console disabled'; then
    docker logs --tail 20 "$CONTAINER" 2>&1 | sed 's/^/  log: /'; say '  nový kontejner neběží správně → rollback'; swap_back; fail 'nasazení vráceno'
  fi
  docker logs "$CONTAINER" 2>&1 | grep -q 'Admin dashboard started.' || { say '  chybí start v logu → rollback'; swap_back; fail 'nasazení vráceno'; }
  ok "nový kontejner běží ($NEW_IMAGE), bez JWT 403; Search Console načteno"
  say 'Deploy OK. Pokračujte: verify (první synchronizace začne 15 s po startu).'
}

sync_state(){ # latest finished sync of THIS container run (older rows from a replaced container are ignored)
  local since; since=$(docker container inspect -f '{{.State.StartedAt}}' "$CONTAINER")
  docker exec -e SINCE="$since" "$CONTAINER" node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/admin.sqlite',{readOnly:true});try{const r=d.prepare('SELECT status,error,calls,last_day FROM gsc_sync WHERE started>=? AND finished IS NOT NULL ORDER BY id DESC LIMIT 1').get(Date.parse(process.env.SINCE)-1000);console.log(r?[r.status,r.error||'-',r.calls,r.last_day||'-'].join(' '):'none')}catch{console.log('none')}" 2>/dev/null
}

verify(){
  say '== Verify'
  [[ -s $STATE/pre10.inspect.json ]] || fail 'nejdřív deploy'
  running "$CONTAINER" || fail "$CONTAINER neběží"
  docker container inspect "$CONTAINER" > "$STATE/new.inspect.json"
  py check "$STATE/new.inspect.json" >/dev/null && ok 'síť, IP 172.30.42.2, volume, mounty, read-only, cap_drop ALL, no-new-privileges, 192 MB, PID 64' || fail 'konfigurace nového kontejneru se liší'
  python3 - "$STATE/pre10.inspect.json" "$STATE/new.inspect.json" <<'PY' && ok 'restart policy, CPU, tmpfs, logování a mounty shodné se starým kontejnerem (+ GSC read-only)' || fail 'rozdíl proti starému kontejneru'
import json,sys
a,b=(json.load(open(p))[0] for p in sys.argv[1:3])
keys=['RestartPolicy','NanoCpus','CpuQuota','Memory','MemorySwap','PidsLimit','ReadonlyRootfs','CapDrop','SecurityOpt','Tmpfs','LogConfig']
diff=[k for k in keys if a['HostConfig'].get(k)!=b['HostConfig'].get(k)]
m=lambda d:sorted((x['Type'],x.get('Name') or x['Source'],x['Destination'],x['RW']) for x in d['Mounts'] if x['Destination']!='/run/secrets/gsc-oauth.json')
g=[x for x in b['Mounts'] if x['Destination']=='/run/secrets/gsc-oauth.json']
ok=not diff and m(a)==m(b) and len(g)==1 and not g[0]['RW']
if not ok: print('  rozdíl:',diff or 'mounty',file=sys.stderr)
sys.exit(0 if ok else 1)
PY
  [[ $(docker container inspect -f '{{.Config.Image}}' "$CONTAINER") == "$NEW_IMAGE" ]] && ok "image $NEW_IMAGE" || fail 'jiný image'
  s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'Host: staging.verimtomu.fyi' "http://$IP:3100/")
  [[ $s == 403 ]] && ok "cesta tunelu http://$IP:3100 bez JWT → 403" || fail "http://$IP:3100 → $s"
  r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 15 "$STAGING/api/seo?days=28")
  [[ $r == 302\ https://$ISSUER_HOST/* && $r == *"kid=$AUD"* ]] && ok 'Cloudflare Access: anonymně 302 na login, AUD sedí' || fail "Access: ${r%% *}"
  for p in / /app.js /style.css /api/dashboard '/api/seo?days=28'; do
    s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$STAGING$p"); [[ $s == 302 ]] || fail "anonymně $p → $s"; done
  ok 'všechny cesty dashboardu anonymně chráněné Access'
  n=$(docker logs "$CONTAINER" 2>&1 | grep -cE 'GOCSPX|1//|refresh_token|client_secret|ya29\.|BEGIN PRIVATE' || true)
  [[ $n == 0 ]] && ok 'log bez tajemství' || fail "log obsahuje $n podezřelých řádků (nevypisuji)"
  snapshot_production > "$STATE/production.after"
  diff -q "$STATE/production.before" "$STATE/production.after" >/dev/null && ok 'produkce beze změny (kontejnery, ID, starty, cloudflared)' || { diff "$STATE/production.before" "$STATE/production.after" | sed 's/^/  /'; fail 'stav produkce se liší od snapshotu'; }
  s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://verimtomu.fyi/); [[ $s == 200 ]] && ok 'https://verimtomu.fyi/ → 200' || fail "verimtomu.fyi → $s"
  say "  paměť: $(docker stats --no-stream --format '{{.MemUsage}}' "$CONTAINER")"
  say '  čekám na první synchronizaci (max 3 min)…'
  st=none; for _ in $(seq 1 36); do st=$(sync_state); [[ $st == ok\ * || $st == error\ * ]] && break; sleep 5; done
  [[ $st == ok\ * ]] || docker logs "$CONTAINER" 2>&1 | grep 'Search Console sync failed' | tail -1 | sed 's/^/  log: /'
  case $st in
    ok\ *) ok "Search Console synchronizace: $st (status, chyba, volání, poslední den)";;
    error\ reauth_required*) fail 'Google odmítl refresh token (reauth_required): zopakujte authorize (runbook §8)';;
    error\ permissions*) fail 'účet nemá v Search Console přístup k property (permissions) nebo GSC_SITE_URL neodpovídá typu property';;
    error\ upstream*) fail 'Google nedosažitelný z kontejneru (upstream): egress';;
    *) fail "synchronizace: $st (diagnostika: bash admin/stage10-staging.sh diagnose)";;
  esac
  say 'Verify OK. Zbývá ruční kontrola v prohlížeči po přihlášení přes Access (runbook).'
}

upgrade_back(){ # stop the upgraded container, bring the previous Stage 10 container back
  local ts; ts=$(date +%Y%m%d%H%M%S)
  exists "$PREV" || fail "$PREV neexistuje"
  if exists "$CONTAINER"; then docker stop -t 10 "$CONTAINER" >/dev/null || true; docker rename "$CONTAINER" "$CONTAINER-failed-$ts"; docker update --restart=no "$CONTAINER-failed-$ts" >/dev/null; fi
  docker rename "$PREV" "$CONTAINER"
  docker update --restart="$(cat "$STATE/prev.restart")" "$CONTAINER" >/dev/null
  docker start "$CONTAINER" >/dev/null
  wait_started "$CONTAINER" 30 && ok "návrat: $CONTAINER běží ($(docker container inspect -f '{{.Config.Image}}' "$CONTAINER")), bez JWT 403" || fail 'návrat: kontejner nenastartoval'
}

upgrade(){
  say "== Upgrade na $NEW_IMAGE (mění jen verimtomu-admin-staging)"
  [[ $(id -u) -eq 0 ]] || fail 'spusťte jako root'
  [[ -s $STATE/production.before ]] || fail 'nejdřív preflight'
  docker image inspect "$NEW_IMAGE" >/dev/null 2>&1 || fail 'nejdřív build'
  [[ $(docker image inspect -f '{{index .Config.Labels "org.verimtomu.commit"}}' "$NEW_IMAGE") == "$COMMIT" ]] || fail 'image není z očekávaného commitu'
  token_ok
  running "$CONTAINER" || fail "$CONTAINER neběží"
  if exists "$PREV" && running "$PREV"; then fail "$PREV běží"; fi
  local cur; cur=$(docker container inspect -f '{{.Config.Image}}' "$CONTAINER")
  [[ -n $(docker image inspect -f '{{index .Config.Labels "org.verimtomu.commit"}}' "$cur" 2>/dev/null) ]] || fail "běžící $cur není nasazení Stage 10 (použijte deploy)"
  [[ $cur != "$NEW_IMAGE" ]] || fail "už běží $NEW_IMAGE"
  docker container inspect "$CONTAINER" > "$STATE/prev.inspect.json"
  py check "$STATE/prev.inspect.json" >/dev/null || fail 'konfigurace běžícího kontejneru neodpovídá očekávání'
  docker container inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$CONTAINER" > "$STATE/prev.restart"
  docker image inspect -f '{{json .Config.Env}}' "$(docker container inspect -f '{{.Image}}' "$CONTAINER")" > "$STATE/image.env.json"
  mapfile -d '' args < <(py args "$STATE/prev.inspect.json" "$STATE/image.env.json" new "$STATE/new.env" "$TOKEN" "$SITE_URL")
  [[ ${#args[@]} -gt 10 ]] || fail 'nelze odvodit parametry kontejneru'
  ok "parametry odvozeny z běžícího kontejneru $cur (${#args[@]} argumentů)"
  # A stopped container of an earlier upgrade is superseded by the one replaced now (pre10 stays untouched).
  if exists "$PREV"; then docker rm "$PREV" >/dev/null; ok "starší zastavený $PREV odstraněn (rollback na $OLD zůstává)"; fi
  docker stop -t 20 "$CONTAINER" >/dev/null
  docker rename "$CONTAINER" "$PREV"
  docker update --restart=no "$PREV" >/dev/null
  ts=$(date +%Y%m%d%H%M%S); docker cp "$PREV:/data" "$STATE/data-pre-upgrade-$ts" && ok "kopie /data: $STATE/data-pre-upgrade-$ts"
  if ! docker run -d --name "$CONTAINER" "${args[@]}" "$NEW_IMAGE" >/dev/null; then
    shred -u "$STATE/new.env" 2>/dev/null || true; say '  start selhal → návrat'; upgrade_back; fail 'upgrade vrácen'
  fi
  shred -u "$STATE/new.env" 2>/dev/null || rm -f "$STATE/new.env"
  if ! wait_started "$CONTAINER" 60 || docker logs "$CONTAINER" 2>&1 | grep -q 'Search Console disabled' || ! docker logs "$CONTAINER" 2>&1 | grep -q 'Admin dashboard started.'; then
    docker logs --tail 20 "$CONTAINER" 2>&1 | sed 's/^/  log: /'; say '  nový kontejner neběží správně → návrat'; upgrade_back; fail 'upgrade vrácen'
  fi
  ok "běží $NEW_IMAGE, bez JWT 403; předchozí kontejner zastaven jako $PREV"
  say 'Upgrade OK. Pokračujte: verify.'
}

diagnose(){
  say '== Diagnostika Search Console (jen čtení; databáze v paměti; vypisuje jen strukturu odpovědí)'
  running "$CONTAINER" || fail "$CONTAINER neběží"
  docker exec -i "$CONTAINER" node --input-type=module - < "$repo/admin/tools/gsc-diagnose.mjs" 2>&1 | grep -v -e ExperimentalWarning -e trace-warnings
}

rollback(){ say '== Rollback'; [[ $(id -u) -eq 0 ]] || fail 'spusťte jako root'; swap_back; say 'Rollback hotový. Refresh token zůstal na VPS (odvolání: runbook §7).'; }

finalize(){
  for c in "$PREV" "$OLD"; do
    exists "$c" || { ok "$c neexistuje"; continue; }
    running "$c" && fail "$c běží"
    docker rm "$c" >/dev/null && ok "$c odstraněn"
  done
  say "  rollback dál možný z $PRE_IMAGE (uložený inspect: $STATE/pre10.inspect.json)"
}

case ${1:-} in
  preflight) preflight;; build) build;; authorize) authorize "${2:-}";; deploy) deploy;; upgrade) upgrade;; verify) verify;; diagnose) diagnose;;
  rollback) rollback;; rollback-upgrade) say '== Návrat před upgrade'; upgrade_back;; finalize) finalize;;
  *) say 'Použití: bash admin/stage10-staging.sh preflight|build|authorize <client.json>|deploy|upgrade|verify|diagnose|rollback|rollback-upgrade|finalize'; exit 1;;
esac
