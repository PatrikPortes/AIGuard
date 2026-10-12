#!/usr/bin/env bash
# Authorized UX overlay only. Preserve running environment, data and relay.
set -Eeuo pipefail
set +x
[[ $(id -u) -eq 0 ]] || exit 1
commit=${1:?Commit required}; archive_hash=${2:?Bundle SHA256 required}
[[ $commit =~ ^[a-f0-9]{40}$ && $archive_hash =~ ^[a-f0-9]{64}$ ]] || exit 1
base=sha256:6d680aa4712a352c4f2d6810561c5b7aec3d1076b06fb361db3663545d05959e
[[ $(docker inspect verimtomu-web --format '{{.Image}}') == "$base" ]] || { echo 'STOP: unknown production image.'; exit 1; }
if docker inspect verimtomu-web-before-ux-audit-20261012 >/dev/null 2>&1; then echo 'STOP: rollback container already exists.'; exit 1; fi
printf '%s  %s\n' "$archive_hash" /tmp/verimtomu-ux-audit-20261012.tar.gz | sha256sum -c -
release=$(mktemp -d /opt/verimtomu/repair-validation/ux-audit.XXXXXX)
tar -xzf /tmp/verimtomu-ux-audit-20261012.tar.gz -C "$release"
# Read inspect privately; never print its Env, which includes credentials.
python3 - "$release" "$base" <<'PY'
import subprocess,json,pathlib,os
r=pathlib.Path(__import__('sys').argv[1]);base=__import__('sys').argv[2]
c=json.loads(subprocess.check_output(['docker','inspect','verimtomu-web']))[0]
assert c['Image']==base
h=c['HostConfig'];assert h['ReadonlyRootfs'] is True and h['CapDrop']==['ALL']
assert 'no-new-privileges:true' in h['SecurityOpt']
assert h['CpuPeriod']==20000 and h['CpuQuota']==10000 and h['Memory']==536870912 and h['PidsLimit']==64
assert h['RestartPolicy']['Name']=='unless-stopped'
assert h['LogConfig']=={'Type':'local','Config':{'max-file':'3','max-size':'10m'}}
assert c['Config']['User']=='65532:65532'
assert not h.get('PortBindings') and not h.get('Privileged')
assert c['NetworkSettings']['Networks']['verimtomu-private']['IPAddress']=='172.30.41.2'
assert set(c['NetworkSettings']['Networks'])=={'verimtomu-private'}
assert len(c['Mounts'])==1 and c['Mounts'][0]['Source']=='/opt/verimtomu/ai-data' and c['Mounts'][0]['Destination']=='/app/data' and c['Mounts'][0]['RW'] is True
assert h['Tmpfs']=={'/tmp':'rw,noexec,nosuid,nodev,size=16m'}
expected=json.loads((r/'expected-production.json').read_text());app={k:v for k,v in expected.items()if not k.startswith('proxy/')}
js='const f=require("fs"),c=require("crypto");let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>{const keys=JSON.parse(s);console.log(JSON.stringify(Object.fromEntries(keys.map(k=>[k,c.createHash("sha256").update(f.readFileSync("/app/"+k)).digest("hex")]))));});'
actual=json.loads(subprocess.check_output(['docker','exec','-i','verimtomu-web','node','-e',js],input=json.dumps(list(app)).encode()))
assert actual==app,'STOP: unknown production file changes'
assert subprocess.check_output(['docker','inspect','verimtomu-ai-proxy','--format','{{.Image}}']).decode().strip()=='sha256:5cded06c2095083afc3747529650de0a2750982417311b4e2d53168d0e8dfe96'
# All current runtime variables are reused verbatim, not replaced by old templates.
fd=os.open(r/'runtime.env',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,'w')as out:
 for value in c['Config']['Env']:
  assert '\n'not in value and '\r'not in value
  out.write(value+'\n')
print('PASS: known production image, source hashes and security configuration.')
PY
# Runtime credentials cannot enter the build context.
cat > "$release/.dockerignore" <<'IGNORE'
runtime.env
IGNORE
docker tag "$base" verimtomu-ux-audit-base:20261012
cat > "$release/Dockerfile" <<DOCKERFILE
FROM verimtomu-ux-audit-base:20261012
LABEL org.opencontainers.image.revision="$commit"
COPY --chown=65532:65532 src/server.js /app/src/server.js
COPY --chown=65532:65532 public/ /app/public/
DOCKERFILE
docker build --network none --pull=false -t verimtomu-web:ux-audit-20261012 "$release"
image=$(docker image inspect verimtomu-web:ux-audit-20261012 --format '{{.Id}}')
[[ $(docker inspect verimtomu-web --format '{{.Image}}') == "$base" ]]
docker stop verimtomu-web
docker rename verimtomu-web verimtomu-web-before-ux-audit-20261012
rollback() { trap - ERR; docker rm -f verimtomu-web >/dev/null 2>&1 || true; docker rename verimtomu-web-before-ux-audit-20261012 verimtomu-web; docker start verimtomu-web >/dev/null; echo 'Previous application restored.'; }
trap rollback ERR
docker run -d --name verimtomu-web --network verimtomu-private --ip 172.30.41.2 \
 --env-file "$release/runtime.env" --mount type=bind,src=/opt/verimtomu/ai-data,dst=/app/data \
 --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges:true \
 --memory 512m --cpu-period 20000 --cpu-quota 10000 --pids-limit 64 \
 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m --log-driver local \
 --log-opt max-size=10m --log-opt max-file=3 "$image"
ready=false
for attempt in $(seq 1 20); do
 if curl --silent --fail --max-time 3 http://172.30.41.2:3000/api/health > "$release/health.json"; then ready=true; break; fi
 sleep 1
done
[[ $ready == true ]]
python3 - "$release/health.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]));assert s['status']=='ok' and s['ai_configured'] is True and s['provider_label']=='OpenAI' and s['rules_fallback'] is True
PY
# Only the four requested public availability checks; no AI requests.
python3 - <<'PY'
import urllib.request,urllib.error
for path,status,needle in [('/',200,'srcset='),('/overit-zpravu',200,'analysis-form'),('/proverit-pujcku',200,'cost-form'),('/ux-audit-not-found',404,'Tuhle stránku jsme nenašli.')]:
 req=urllib.request.Request('https://verimtomu.fyi'+path,headers={'User-Agent':'verimtomu-deployment-check/1.0','Accept':'text/html'})
 try:r=urllib.request.urlopen(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 assert r.status==status,(path,r.status)
 assert r.headers.get_content_type()=='text/html'
 assert needle in r.read().decode(),path
 print('PASS:',path,status)
PY
trap - ERR
printf '%s\n' "$release" > /opt/verimtomu/repair-validation/live-release
printf '%s\n' "$image" > "$release/image-id"
echo "UX AUDIT DEPLOYED: $commit"
