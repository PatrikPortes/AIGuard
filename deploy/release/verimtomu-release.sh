#!/usr/bin/env bash
# Věřím tomu? — production release of verimtomu-web AND verimtomu-ai-proxy from ONE approved Git SHA.
#
#   verimtomu-web       = root Dockerfile         (git archive <SHA>; release gate runs inside the build)
#   verimtomu-ai-proxy  = deploy/release/ai-proxy.Dockerfile (context: ai-proxy.cjs from the same archive)
#
# Run as root on the VPS, one step at a time; stop at the first STOP:
#   bash verimtomu-release.sh prepare  <SHA>   records the RUNNING images of both services as rollback targets
#   bash verimtomu-release.sh build    <SHA>   builds + checks both images, starts each artifact in isolation
#   (merge the approved PR with "Create a merge commit"; the merged tree must equal the release tree)
#   bash verimtomu-release.sh deploy   <SHA> [all|proxy|web]   on any failure: auto-rollback of what THIS run changed
#   bash verimtomu-release.sh verify   <SHA>
#   bash verimtomu-release.sh rollback <SHA> [all|proxy|web]   independent per service
#   bash verimtomu-release.sh coi      <SHA>   (optional) reinstall the host ČOI sync from this release
#
# Never changes: firewall, Cloudflare, DNS, tunnel, Docker networks, persistent data, env values.
# Adds no AI_CONTRACT_* variable (AI_CONTRACT_ENABLED stays unset = false). Previous containers are
# kept, stopped and renamed <name>-before-<sha7>, with their original image and configuration.
# The retired overlay tools in deploy/web-checker/ refuse to run and are never used here.
set -Eeuo pipefail

CMD=${1:-}; SHA=${2:-}; TARGET=${3:-all}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: $0 prepare|build|deploy|verify|rollback|coi <full 40-char SHA> [all|proxy|web]" >&2; exit 2; }
[[ "$TARGET" =~ ^(all|proxy|web)$ ]] || { echo "target must be all, proxy or web" >&2; exit 2; }
S=${SHA:0:7}
REPO=${REPO:-https://github.com/PatrikPortes/AIGuard.git}
SOURCE_BRANCH=${SOURCE_BRANCH:-feat/contract-checker-mvp}
BASE_BRANCH=${BASE_BRANCH:-release/web-checker-2-2026-10-13}
ORIGIN=${ORIGIN:-https://verimtomu.fyi}
DATA=${DATA:-/opt/verimtomu/ai-data}
REL=${RELEASES_DIR:-/opt/verimtomu/releases}/$S
WEB=verimtomu-web
PROXY=verimtomu-ai-proxy
WEB_TAG=verimtomu-web:release-$S
PROXY_TAG=verimtomu-ai-proxy:release-$S
PROXY_ENTRYPOINT='["/nodejs/bin/node","--max-old-space-size=64","/app/ai-proxy.cjs"]'

say(){ printf '\n== %s\n' "$*"; }
DEPLOYING=0
# During deploy every STOP rolls back what this run already changed (exit alone would not fire ERR).
die(){ printf '\n!! STOP: %s\n' "$*" >&2; [ "$DEPLOYING" = 1 ] && auto_rollback; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root"
services(){ case "$TARGET" in all) echo "$PROXY $WEB";; proxy) echo "$PROXY";; web) echo "$WEB";; esac; }
image_file(){ [ "$1" = "$WEB" ] && echo "$REL/web-image-id" || echo "$REL/proxy-image-id"; }
rollback_file(){ [ "$1" = "$WEB" ] && echo "$REL/web-rollback-image" || echo "$REL/proxy-rollback-image"; }

# --- container runtime clone (shared by deploy and the build-time pre-check) -------------------
# Copies env (minus the old image's own defaults), mounts, networks + fixed private IPs, read-only,
# caps, security-opt, limits, pids, tmpfs, ulimits, logging, restart policy, user and an explicitly
# overridden command. Values are never printed. MODE=check validates everything without creating.
clone_run(){ # $1 MODE (check|create)  $2 source container  $3 new image  $4 new name
python3 - "$@" <<'PY'
import json, subprocess, sys, os, tempfile
mode, src, image, name = sys.argv[1:]
c = json.loads(subprocess.check_output(['docker', 'inspect', src]))[0]
old_img = json.loads(subprocess.check_output(['docker', 'image', 'inspect', c['Image']]))[0]
new_img = json.loads(subprocess.check_output(['docker', 'image', 'inspect', image]))[0]
h, cfg = c['HostConfig'], c['Config']
img_env = set(old_img['Config'].get('Env') or [])
env = [e for e in (cfg.get('Env') or []) if e not in img_env]
PRIVATE_IP = {'verimtomu-web': '172.30.41.2', 'verimtomu-ai-proxy': '172.30.41.3'}
nets = list(c['NetworkSettings']['Networks'].items())
def ip_of(net):
    # verimtomu-private addresses are fixed by the architecture; every other network keeps a
    # dynamic address. (The source may be stopped, so only its configuration is used.)
    if net[0] == 'verimtomu-private':
        configured = (net[1].get('IPAMConfig') or {}).get('IPv4Address')
        if configured and configured != PRIVATE_IP.get(name): sys.exit('refusing: configured verimtomu-private IP %s differs from expected' % configured)
        if name not in PRIVATE_IP: sys.exit('refusing: no fixed verimtomu-private IP known for ' + name)
        return PRIVATE_IP[name]
    return ''
keys = lambda envs: {e.split('=', 1)[0] for e in envs or []}
lost = keys(old_img['Config'].get('Env')) - keys(new_img['Config'].get('Env')) - {'PATH', 'NODE_VERSION', 'YARN_VERSION'} - keys(env)
if lost: sys.exit('refusing: new image lacks env keys the old image provided: ' + ', '.join(sorted(lost)))
if h.get('Privileged'): sys.exit('refusing: old container is privileged')
norm = lambda v: v or None
if norm(cfg.get('Entrypoint')) != norm(old_img['Config'].get('Entrypoint')): sys.exit('refusing: old container overrides ENTRYPOINT; review manually')
args = ['docker', 'create', '--name', name]
first, rest = nets[0], nets[1:]
args += ['--network', first[0]] + (['--ip', ip_of(first)] if ip_of(first) else [])
for net in rest: ip_of(net)
rp = h.get('RestartPolicy') or {}
if rp.get('Name') and rp['Name'] != 'no':
    args += ['--restart', rp['Name'] + (':' + str(rp['MaximumRetryCount']) if rp['Name'] == 'on-failure' and rp.get('MaximumRetryCount') else '')]
if h.get('ReadonlyRootfs'): args.append('--read-only')
for cap in h.get('CapDrop') or []: args += ['--cap-drop', cap]
for cap in h.get('CapAdd') or []: args += ['--cap-add', cap]
for opt in h.get('SecurityOpt') or []: args += ['--security-opt', opt]
if h.get('Memory'): args += ['--memory', str(h['Memory'])]
if h.get('MemorySwap'): args += ['--memory-swap', str(h['MemorySwap'])]
if h.get('NanoCpus'): args += ['--cpus', str(h['NanoCpus'] / 1e9)]
if h.get('CpuQuota') and not h.get('NanoCpus'): args += ['--cpu-quota', str(h['CpuQuota'])]
if h.get('CpuPeriod') and not h.get('NanoCpus'): args += ['--cpu-period', str(h['CpuPeriod'])]
if h.get('PidsLimit'): args += ['--pids-limit', str(h['PidsLimit'])]
for path, opts in (h.get('Tmpfs') or {}).items(): args += ['--tmpfs', path + (':' + opts if opts else '')]
for u in h.get('Ulimits') or []: args += ['--ulimit', '%s=%s:%s' % (u['Name'], u['Soft'], u['Hard'])]
for m in c.get('Mounts') or []:
    if m['Type'] == 'bind': args += ['--mount', 'type=bind,src=%s,dst=%s%s' % (m['Source'], m['Destination'], '' if m['RW'] else ',readonly')]
    elif m['Type'] == 'volume': args += ['--mount', 'type=volume,src=%s,dst=%s%s' % (m['Name'], m['Destination'], '' if m['RW'] else ',readonly')]
    else: sys.exit('refusing: unsupported mount type ' + m['Type'] + '; review manually')
for port, binds in (h.get('PortBindings') or {}).items():
    for b in binds or []: args += ['-p', '%s:%s:%s' % (b.get('HostIp') or '0.0.0.0', b['HostPort'], port)]
lc = h.get('LogConfig') or {}
if lc.get('Type'): args += ['--log-driver', lc['Type']]
for k, v in (lc.get('Config') or {}).items(): args += ['--log-opt', '%s=%s' % (k, v)]
if cfg.get('User') and cfg['User'] != (old_img['Config'].get('User') or ''): args += ['--user', cfg['User']]
cmd = cfg.get('Cmd') if norm(cfg.get('Cmd')) != norm(old_img['Config'].get('Cmd')) else None
if mode == 'check':
    print('clone pre-check OK:', name, '(env keys, entrypoint, mounts, networks, privileges)'); sys.exit(0)
fd, envfile = tempfile.mkstemp(prefix='verim-env-', dir='/root'); os.fchmod(fd, 0o600)
with os.fdopen(fd, 'w') as f:
    for e in env:
        assert '\n' not in e
        f.write(e + '\n')
args[4:4] = ['--env-file', envfile]
args.append(image)
if cmd: args += cmd
try:
    cid = subprocess.check_output(args).decode().strip()
    for net in rest:
        subprocess.check_call(['docker', 'network', 'connect'] + (['--ip', ip_of(net)] if ip_of(net) else []) + [net[0], name])
finally:
    os.unlink(envfile)
print('created', name, cid[:12])
PY
}

# --- compare preserved runtime settings of two containers (no secrets printed) ----------------
compare_runtime(){ # $1 old, $2 new
python3 - "$1" "$2" <<'PY'
import json, subprocess, sys
o, n = (json.loads(subprocess.check_output(['docker', 'inspect', x]))[0] for x in sys.argv[1:])
oi, ni = (json.loads(subprocess.check_output(['docker', 'image', 'inspect', x['Image']]))[0] for x in (o, n))
def env(c, i): return sorted(set(c['Config'].get('Env') or []) - set(i['Config'].get('Env') or []))
PRIVATE_IP = {'verimtomu-web': '172.30.41.2', 'verimtomu-ai-proxy': '172.30.41.3'}
def network_problems(o, n):
    name = n['Name'].lstrip('/'); on, nn = o['NetworkSettings']['Networks'], n['NetworkSettings']['Networks']
    problems = []
    if sorted(on) != sorted(nn): problems.append('network set %s != %s' % (sorted(on), sorted(nn)))
    for k, v in nn.items():
        pinned = (v.get('IPAMConfig') or {}).get('IPv4Address')
        if k == 'verimtomu-private':
            if v.get('IPAddress') != PRIVATE_IP.get(name) or pinned != PRIVATE_IP.get(name): problems.append('verimtomu-private is %s (pinned %s), expected %s' % (v.get('IPAddress'), pinned, PRIVATE_IP.get(name)))
        else:
            if pinned: problems.append('%s must not be pinned (got %s)' % (k, pinned))
            if not v.get('IPAddress'): problems.append('%s not connected' % k)
    return problems
def mounts(c): return sorted((m['Type'], m.get('Source'), m['Destination'], m['RW']) for m in c.get('Mounts') or [])
keys = ['ReadonlyRootfs', 'CapDrop', 'CapAdd', 'SecurityOpt', 'Memory', 'MemorySwap', 'NanoCpus', 'CpuQuota', 'CpuPeriod', 'PidsLimit', 'Tmpfs', 'Ulimits', 'LogConfig', 'RestartPolicy', 'Privileged', 'PortBindings']
bad = [k for k in keys if (o['HostConfig'].get(k) or None) != (n['HostConfig'].get(k) or None)]
if env(o, oi) != env(n, ni): bad.append('Env')
net_bad = network_problems(o, n)
if net_bad: bad.append('Networks/IP: ' + '; '.join(net_bad))
if mounts(o) != mounts(n): bad.append('Mounts')
if n['Name'].lstrip('/') == 'verimtomu-web' and any(e.startswith('AI_CONTRACT_') for e in n['Config'].get('Env') or []): bad.append('AI_CONTRACT_* present on web')
if bad: sys.exit('runtime differs: ' + ', '.join(bad))
print('runtime identical (env, mounts, read-only, caps, security-opt, limits, pids, tmpfs, logging, restart):', n['Name'])
print('networks:', ', '.join('%s=%s%s' % (k, v.get('IPAddress'), ' (fixed)' if k == 'verimtomu-private' else ' (dynamic)') for k, v in sorted(n['NetworkSettings']['Networks'].items())))
PY
}

health_of(){ # $1 service — health check executed inside the web container (the only client of the relay)
  if [ "$1" = "$PROXY" ]; then
    docker exec "$WEB" node -e "fetch('http://172.30.41.3:8080/health',{signal:AbortSignal.timeout(4000)}).then(r=>{if(r.status!==200)process.exit(1);console.log('relay reachable from web: 200')}).catch(()=>process.exit(1))"
  else
    docker exec "$WEB" node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>r.json()).then(j=>{if(j.status!=='ok')process.exit(1);console.log('health',j.status,'mode',j.mode)}).catch(()=>process.exit(1))"
  fi
}

# --- independent rollback of ONE service: the kept container with its original image + config --
rollback_service(){ # $1 service
  local n=$1 want; want=$(cat "$(rollback_file "$n")")
  if ! docker inspect "$n-before-$S" >/dev/null 2>&1; then echo "$n: nothing to roll back (no $n-before-$S)"; return 0; fi
  [ "$(docker inspect -f '{{.Image}}' "$n-before-$S")" = "$want" ] || die "$n-before-$S does not hold the recorded rollback image"
  docker rm -f "$n" >/dev/null 2>&1 || true
  docker rename "$n-before-$S" "$n"
  docker start "$n" >/dev/null
  [ "$(docker inspect -f '{{.Image}}' "$n")" = "$want" ] && echo "$n rolled back to $want"
}
DEPLOYED=()
auto_rollback(){
  trap - ERR; DEPLOYING=0
  say "AUTO-ROLLBACK of services changed in this run: ${DEPLOYED[*]:-none}"
  local i; for (( i=${#DEPLOYED[@]}-1; i>=0; i-- )); do rollback_service "${DEPLOYED[$i]}"; done
  sleep 3; docker ps --filter "name=verimtomu" --format '{{.Names}} {{.Image}} {{.Status}}'
  echo "ROLLED BACK. Firewall, Cloudflare, DNS, networks and data were not changed."; exit 1
}
deploy_service(){ # $1 service
  local n=$1 img; img=$(cat "$(image_file "$n")")
  [ "$(docker inspect -f '{{.Image}}' "$n")" = "$(cat "$(rollback_file "$n")")" ] || die "$n is not running the recorded rollback image (already deployed?)"
  say "DEPLOY $n (previous kept as $n-before-$S)"
  clone_run check "$n" "$img" "$n"
  docker rename "$n" "$n-before-$S"; DEPLOYED+=("$n"); docker stop "$n-before-$S" >/dev/null
  clone_run create "$n-before-$S" "$img" "$n"; docker start "$n" >/dev/null; sleep 5
  compare_runtime "$n-before-$S" "$n"
  [ "$(docker inspect -f '{{.Image}}' "$n")" = "$img" ] || die "$n runs an unexpected image"
  health_of "$n"
}

case "$CMD" in
prepare)
  say "PREPARE $SHA"
  for c in git docker python3 curl; do command -v "$c" >/dev/null || die "missing $c"; done
  docker buildx version >/dev/null 2>&1 || die "Docker BuildKit/buildx required (Dockerfile uses RUN --network=none)"
  for n in "$WEB" "$PROXY"; do
    docker inspect "$n" >/dev/null 2>&1 || die "container $n not found"
    [ "$(docker inspect -f '{{.State.Running}}' "$n")" = true ] || die "$n is not running"
    ! docker inspect "$n-before-$S" >/dev/null 2>&1 || die "$n-before-$S already exists"
  done
  [ "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' "$WEB")" = "$DATA" ] \
    || die "web /app/data is not bind-mounted from $DATA — do not continue"
  install -d -m 0700 "$REL"
  # Rollback targets = what runs NOW. Recorded once; a re-run must find the same images.
  for n in "$WEB" "$PROXY"; do
    cur=$(docker inspect -f '{{.Image}}' "$n"); f=$(rollback_file "$n")
    if [ -s "$f" ]; then [ "$(cat "$f")" = "$cur" ] || die "$n image changed since prepare"; else echo "$cur" > "$f"; fi
    docker tag "$cur" "$n:rollback-$S"; echo "$n rollback image: $cur (tag $n:rollback-$S)"
  done
  docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' "$WEB" "$PROXY"
  [ -d "$REL/git" ] || git clone -q --no-checkout "$REPO" "$REL/git"
  git -C "$REL/git" fetch -q origin "$SOURCE_BRANCH" "$BASE_BRANCH"
  git -C "$REL/git" cat-file -e "$SHA^{commit}" || die "release commit not found"
  rm -rf "$REL/src" && install -d -m 0700 "$REL/src"
  git -C "$REL/git" archive "$SHA" | tar -x -C "$REL/src"
  git -C "$REL/git" rev-parse "$SHA^{tree}" > "$REL/source-tree"
  grep -q '^AI_CONTRACT_ENABLED=false$' "$REL/src/deploy/env/contract.env.example" || die "contract env example changed"
  [ "$(tr -d ' \n' < "$REL/src/public/contract-legal-catalog.json")" = "[]" ] || die "legal catalogue is not []"
  [ -s "$REL/src/deploy/release/ai-proxy.Dockerfile" ] && [ -s "$REL/src/ai-proxy.cjs" ] || die "relay build inputs missing from $SHA"
  echo "PREPARE OK — source $SHA tree $(cat "$REL/source-tree")"
  ;;

build)
  [ -d "$REL/src" ] && [ -s "$REL/web-rollback-image" ] && [ -s "$REL/proxy-rollback-image" ] || die "run prepare first"
  say "BUILD $WEB (release gate runs inside the image build)"
  if ! DOCKER_BUILDKIT=1 docker build --progress=plain --no-cache-filter validated --platform linux/amd64 --build-arg "VCS_REF=$SHA" --iidfile "$REL/web-image-id" -t "$WEB_TAG" "$REL/src" > "$REL/web-build.log" 2>&1; then
    tail -40 "$REL/web-build.log"; die "web build/gate failed — see $REL/web-build.log"; fi
  grep -E 'ℹ (tests|pass|fail) |Claude strict gate' "$REL/web-build.log" || die "gate summary not found in build log"
  WEB_IMG=$(cat "$REL/web-image-id")
  [ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$WEB_IMG")" = "$SHA" ] || die "web image revision label mismatch"
  docker run --rm --network none --entrypoint node "$WEB_IMG" -e "const fs=require('fs');const c=fs.readFileSync('/app/public/contract-legal-catalog.json','utf8').trim();if(c!=='[]')process.exit(1);for(const f of ['/app/src/server.js','/app/public/smlouva.html','/app/public/contract.js','/app/public/vendor/pdfjs/legacy/build/pdf.mjs','/app/public/vendor/pdfjs/legacy/build/pdf.worker.mjs'])fs.accessSync(f);console.log('web image: catalogue [], contract page + modules + PDF.js present')" || die "web image content check failed"

  say "BUILD $PROXY from the same archive (deploy/release/ai-proxy.Dockerfile)"
  rm -rf "$REL/proxy" && install -d -m 0700 "$REL/proxy"
  cp "$REL/src/ai-proxy.cjs" "$REL/proxy/ai-proxy.cjs"; cp "$REL/src/deploy/release/ai-proxy.Dockerfile" "$REL/proxy/Dockerfile"
  docker build --network none --platform linux/amd64 --build-arg "VCS_REF=$SHA" --iidfile "$REL/proxy-image-id" -t "$PROXY_TAG" "$REL/proxy" > "$REL/proxy-build.log" 2>&1 || { tail -20 "$REL/proxy-build.log"; die "relay build failed"; }
  PROXY_IMG=$(cat "$REL/proxy-image-id")
  [ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$PROXY_IMG")" = "$SHA" ] || die "relay image revision label mismatch"
  [ "$(docker image inspect -f '{{json .Config.Entrypoint}} {{.Config.User}}' "$PROXY_IMG")" = "$PROXY_ENTRYPOINT 65532:65532" ] || die "relay entrypoint/user unexpected"
  WANT=$(sha256sum "$REL/src/ai-proxy.cjs" | cut -d' ' -f1)
  GOT=$(docker run --rm --network none --entrypoint node "$PROXY_IMG" -e "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync('/app/ai-proxy.cjs')).digest('hex'))")
  [ "$WANT" = "$GOT" ] || die "relay image does not contain ai-proxy.cjs from $SHA"
  docker run --rm --network none --entrypoint node "$PROXY_IMG" --check /app/ai-proxy.cjs || die "relay syntax check failed"
  echo "relay image contains ai-proxy.cjs sha256 $GOT (= release)"

  say "PRE-CHECK: both images can take over the current runtime configuration"
  clone_run check "$WEB" "$WEB_IMG" "$WEB"
  clone_run check "$PROXY" "$PROXY_IMG" "$PROXY"

  say "ARTIFACT START: each built image starts in isolation (--network none, read-only, current env)"
  for n in "$WEB" "$PROXY"; do
    python3 - "$n" "$REL/$n.smoke.env" <<'PY'
import json, subprocess, sys, os
c = json.loads(subprocess.check_output(['docker', 'inspect', sys.argv[1]]))[0]
i = json.loads(subprocess.check_output(['docker', 'image', 'inspect', c['Image']]))[0]
fd = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    for e in c['Config'].get('Env') or []:
        if e not in (i['Config'].get('Env') or []): f.write(e + '\n')
PY
  done
  # Scratch data dir: never the live $DATA (SQLite budgets); only a copy of the session secret.
  SMOKE_DATA=$(mktemp -d "$REL/smoke-data.XXXXXX"); chmod 0700 "$SMOKE_DATA"
  [ -f "$DATA/session-secret" ] && install -m 0600 "$DATA/session-secret" "$SMOKE_DATA/session-secret"
  chown -R 65532:65532 "$SMOKE_DATA"
  smoke(){ # $1 name $2 image $3 env file $4 probe
    docker rm -f "$1" >/dev/null 2>&1 || true
    docker run -d --name "$1" --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true --mount "type=bind,src=$SMOKE_DATA,dst=/app/data" --env-file "$3" "$2" >/dev/null
    sleep 4; local rc=0; docker exec "$1" node -e "$4" || rc=1
    [ $rc -eq 0 ] || docker logs "$1" 2>&1 | tail -5; docker rm -f "$1" >/dev/null; return $rc
  }
  smoke "verimtomu-smoke-web-$S" "$WEB_IMG" "$REL/$WEB.smoke.env" "Promise.all([fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()),fetch('http://127.0.0.1:3000/contract-legal-catalog.json').then(r=>r.text()),fetch('http://127.0.0.1:3000/proverit-smlouvu').then(r=>r.status)]).then(([h,c,p])=>{if(h.status!=='ok'||c.trim()!=='[]'||p!==200)process.exit(1);console.log('web artifact started: health ok mode',h.mode,'| catalogue [] | /proverit-smlouvu 200')}).catch(()=>process.exit(1))" \
    || { rm -f "$REL"/*.smoke.env; rm -rf "$SMOKE_DATA"; die "new web image does not start with the current configuration"; }
  smoke "verimtomu-smoke-proxy-$S" "$PROXY_IMG" "$REL/$PROXY.smoke.env" "fetch('http://127.0.0.1:8080/health').then(r=>{if(r.status!==200)process.exit(1);console.log('relay artifact started: /health 200')}).catch(()=>process.exit(1))" \
    || { rm -f "$REL"/*.smoke.env; rm -rf "$SMOKE_DATA"; die "new relay image does not start with the current configuration"; }
  rm -f "$REL"/*.smoke.env; rm -rf "$SMOKE_DATA"
  # The web artifact start above already ran scripts/production-guard.js (image CMD) with the current env.
  echo "BUILD OK"
  echo "web image:   $WEB_IMG   (rollback: $(cat "$REL/web-rollback-image"))"
  echo "proxy image: $PROXY_IMG   (rollback: $(cat "$REL/proxy-rollback-image"))"
  ;;

deploy)
  [ -s "$REL/web-image-id" ] && [ -s "$REL/proxy-image-id" ] || die "run build first"
  if [ "${SKIP_MERGE_CHECK:-}" != 1 ]; then
    say "MERGE check: merged tree must equal the release tree"
    git -C "$REL/git" fetch -q origin "$BASE_BRANCH"
    MERGE=$(git -C "$REL/git" rev-parse "origin/$BASE_BRANCH")
    git -C "$REL/git" merge-base --is-ancestor "$SHA" "$MERGE" || die "$BASE_BRANCH does not contain $SHA (PR not merged?)"
    [ "$(git -C "$REL/git" rev-parse "$MERGE^{tree}")" = "$(cat "$REL/source-tree")" ] || die "merged tree differs from release tree — rebuild from $MERGE"
    echo "merge $MERGE has the identical tree to release $SHA"
  fi
  DEPLOYING=1; trap auto_rollback ERR
  # Relay first: the new web image only uses relay routes the current relay already serves.
  for n in $(services); do deploy_service "$n"; done
  curl -fsS --max-time 15 "$ORIGIN/api/health" >/dev/null
  trap - ERR; DEPLOYING=0
  echo "DEPLOY OK ($TARGET) — run: bash $0 verify $SHA   (on failure: bash $0 rollback $SHA [all|proxy|web])"
  ;;

verify)
  say "VERIFY"
  WEB_IMG=$(cat "$REL/web-image-id"); PROXY_IMG=$(cat "$REL/proxy-image-id"); FAIL=0
  ok(){ echo "PASS  $*"; }; ko(){ echo "FAIL  $*"; FAIL=1; }
  [ "$(docker inspect -f '{{.Image}}' "$WEB")" = "$WEB_IMG" ] && ok "web image $WEB_IMG" || ko "web image"
  [ "$(docker inspect -f '{{.Image}}' "$PROXY")" = "$PROXY_IMG" ] && ok "proxy image $PROXY_IMG" || ko "proxy image"
  for i in "$WEB_IMG" "$PROXY_IMG"; do [ "$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$i")" = "$SHA" ] && ok "revision $SHA" || ko "revision of $i"; done
  for n in "$WEB" "$PROXY"; do docker inspect "$n-before-$S" >/dev/null 2>&1 && [ "$(docker inspect -f '{{.Image}}' "$n-before-$S")" = "$(cat "$(rollback_file "$n")")" ] && ok "rollback container $n-before-$S kept" || ko "rollback container $n-before-$S"; done
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$WEB" | grep -q '^AI_CONTRACT_' && ko "AI_CONTRACT_* present" || ok "no AI_CONTRACT_* (AI_CONTRACT_ENABLED unset = false)"
  J=$(curl -fsS --max-time 15 "$ORIGIN/api/health") && echo "$J" | grep -q '"status":"ok"' && ok "/api/health $J" || ko "/api/health"
  for p in / /overit-zpravu /proverit-pujcku /proverit-web /proverit-smlouvu /privacy /uz-se-to-stalo /vendor/pdfjs/legacy/build/pdf.mjs /vendor/pdfjs/legacy/build/pdf.worker.mjs; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$ORIGIN$p")" = 200 ] && ok "GET $p 200" || ko "GET $p"
  done
  curl -fsS -D - -o /dev/null --max-time 15 "$ORIGIN/vendor/pdfjs/legacy/build/pdf.worker.mjs" | grep -i '^content-security-policy' | grep -q "connect-src 'none'" && ok "PDF.js worker CSP connect-src 'none'" || ko "worker CSP"
  curl -fsS --max-time 15 "$ORIGIN/api/contract-status" | grep -q '"configured":false' && ok "/api/contract-status configured:false" || ko "contract-status"
  [ "$(curl -fsS --max-time 15 "$ORIGIN/contract-legal-catalog.json" | tr -d ' \n')" = "[]" ] && ok "legal catalogue []" || ko "catalogue"
  CSP=$(curl -fsS -D - -o /dev/null --max-time 15 "$ORIGIN/uz-se-to-stalo" | grep -i '^content-security-policy' | tr -d '\r')
  echo "$CSP" | grep -q "script-src 'self';" && ! echo "$CSP" | grep -qiE 'https?://' && ok "/uz-se-to-stalo script-src 'self', no third-party origin" || ko "M9 CSP: $CSP"
  curl -fsS -D - -o /dev/null --max-time 15 "$ORIGIN/proverit-smlouvu" | grep -i '^content-security-policy' | grep -q 'challenges.cloudflare.com' && ko "Turnstile origin present while AI is off" || ok "no Turnstile origin (AI off)"
  JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
  curl -fsS -c "$JAR" --max-time 15 "$ORIGIN/api/session" >/dev/null && ok "/api/session" || ko "/api/session"
  post(){ curl -sS -b "$JAR" --max-time 20 -H "Origin: $ORIGIN" -H 'Content-Type: application/json' -d "$2" "$ORIGIN$1"; }
  post /api/analyze '{"type":"text","content":"Mami, mám nové číslo. Pošli mi ihned 12 000 Kč, nevolej mi."}' | grep -q '"engine":"rules-v1"' && ok "Prověřit zprávu (rules)" || ko "message check"
  A=$(post /api/eshop-operator '{"ico":"00006947"}' || true); echo "$A" | grep -q 'Ministerstvo financí' && ok "ARES via app+relay" || ko "ARES: $A"
  docker exec "$WEB" node -e "fetch('https://ares.gov.cz/',{signal:AbortSignal.timeout(5000)}).then(()=>{console.log('OPEN');process.exit(1)}).catch(()=>console.log('BLOCKED'))" && ok "web → ares.gov.cz BLOCKED" || ko "web has direct outbound"
  for n in "$WEB" "$PROXY"; do docker logs --since 15m "$n" 2>&1 | grep -qiE 'error|exception|unhandled' && ko "errors in $n log" || ok "$n log clean"; done
  [ "$FAIL" -eq 0 ] && echo "VERIFY OK" || { echo "VERIFY FAILED — run: bash $0 rollback $SHA [all|proxy|web]"; exit 1; }
  ;;

rollback)
  [ -s "$REL/web-rollback-image" ] && [ -s "$REL/proxy-rollback-image" ] || die "no recorded rollback images for $S"
  say "ROLLBACK ($TARGET)"
  # Reverse order of deployment: web first, then relay.
  for n in $(services | tr ' ' '\n' | tac); do rollback_service "$n"; done
  sleep 3; for n in $(services); do health_of "$n" || echo "WARN: $n health check failed after rollback"; done
  docker ps --filter "name=verimtomu" --format '{{.Names}} {{.Image}} {{.Status}}'
  echo "ROLLED BACK ($TARGET). Firewall, Cloudflare, DNS, networks and data were not changed."
  ;;

coi)
  say "ČOI host synchronisation (optional; already installed by an earlier release)"
  [ -d "$REL/src" ] || die "run prepare first"
  command -v systemctl >/dev/null || die "missing systemctl"
  install -d -o 65532 -g 65532 -m 0755 "$DATA/eshop-sources"
  install -d -o root -g root -m 0755 /opt/verimtomu/eshop-sync
  install -o root -g root -m 0755 "$REL/src/scripts/sync-coi.py" /opt/verimtomu/eshop-sync/sync-coi.py
  install -o root -g root -m 0644 "$REL/src/deploy/eshop/coi-sync.service" /etc/systemd/system/coi-sync.service
  install -o root -g root -m 0644 "$REL/src/deploy/eshop/coi-sync.timer" /etc/systemd/system/coi-sync.timer
  systemctl daemon-reload && systemctl enable --now coi-sync.timer && systemctl is-active coi-sync.timer
  echo "ČOI OK"
  ;;
*) echo "usage: $0 prepare|build|deploy|verify|rollback|coi <SHA> [all|proxy|web]"; exit 2 ;;
esac
