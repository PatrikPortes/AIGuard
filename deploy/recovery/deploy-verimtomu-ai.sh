#!/usr/bin/env bash
set -Eeuo pipefail
set +x
[ "$(id -u)" -eq 0 ] || exit 1
base=sha256:d671ebf01c1cb4bc975b9c0f7c716bdb7c16fced8563c5abd11e1db34b5c78d9
if [ "$(docker inspect verimtomu-web --format '{{.Image}}')" != "$base" ]; then echo 'STOP: Unexpected running release.'; exit 1; fi
for name in verimtomu-web-before-ai verimtomu-ai-proxy; do
 if docker inspect "$name" >/dev/null 2>&1; then echo 'STOP: AI or rollback container already exists.'; exit 1; fi
done
test -s /opt/verimtomu/env/openai-key.env
systemctl is-active --quiet verimtomu-app-firewall.service
printf '%s\n' '83924ebc4c9ad63b7bdfc12112bb19a8ae813f79fe5274432f4c50ab1768538e  /tmp/verimtomu-ai.tar.gz' | sha256sum -c -
release=$(mktemp -d /opt/verimtomu/repair-validation/ai.XXXXXX)
tar -xzf /tmp/verimtomu-ai.tar.gz -C "$release"
chmod -R a+rX "$release"
docker tag "$base" verimtomu-ai-base:local
cat > "$release/Dockerfile" <<'DOCKERFILE'
FROM verimtomu-ai-base:local
LABEL org.opencontainers.image.revision="6db985fcd2602916cb3941aaae9d48f22661d0cb+repairs+ux+share+ai-limits"
COPY --chown=65532:65532 src/ /app/src/
COPY --chown=65532:65532 public/ /app/public/
DOCKERFILE
cat > "$release/Proxy.Dockerfile" <<'DOCKERFILE'
FROM verimtomu-ai-base:local
COPY --chown=65532:65532 ai-proxy.cjs /app/ai-proxy.cjs
USER 65532:65532
ENTRYPOINT ["node", "--max-old-space-size=64", "/app/ai-proxy.cjs"]
CMD []
HEALTHCHECK NONE
DOCKERFILE
docker build --network none --pull=false -t verimtomu-web:ai "$release"
docker build --network none --pull=false -f "$release/Proxy.Dockerfile" -t verimtomu-ai-proxy:local "$release"
image=$(docker image inspect verimtomu-web:ai --format '{{.Id}}')
proxy_image=$(docker image inspect verimtomu-ai-proxy:local --format '{{.Id}}')
install -d -m 700 -o 65532 -g 65532 /opt/verimtomu/ai-data
if [ ! -s /opt/verimtomu/ai-data/session-secret ]; then head -c 32 /dev/urandom > /opt/verimtomu/ai-data/session-secret; fi
chown 65532:65532 /opt/verimtomu/ai-data/session-secret
chmod 600 /opt/verimtomu/ai-data/session-secret
install -m 600 "$release/ai.env" /opt/verimtomu/env/ai.env
cp /usr/local/sbin/verimtomu-app-firewall "$release/firewall-before"
changed=false
rollback() {
 trap - ERR
 if [ "$changed" = true ]; then
  docker rm -f verimtomu-web >/dev/null 2>&1 || true
  docker rename verimtomu-web-before-ai verimtomu-web
  docker start verimtomu-web >/dev/null
 fi
 docker rm -f verimtomu-ai-proxy >/dev/null 2>&1 || true
 iptables -D DOCKER-USER -s 172.30.41.2/32 -d 172.30.41.3/32 -p tcp --dport 8080 -j ACCEPT 2>/dev/null || true
 cp "$release/firewall-before" /usr/local/sbin/verimtomu-app-firewall
 echo 'Previous rules-only application restored. AI was not left enabled.'
}
trap rollback ERR
if ! docker network inspect verimtomu-ai-egress >/dev/null 2>&1; then docker network create verimtomu-ai-egress; fi
docker run -d --name verimtomu-ai-proxy --network verimtomu-ai-egress \
 --env-file /opt/verimtomu/env/openai-key.env --restart unless-stopped \
 --read-only --cap-drop ALL --security-opt no-new-privileges:true \
 --memory 128m --cpus .25 --pids-limit 32 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=4m \
 --log-driver local --log-opt max-size=5m --log-opt max-file=2 "$proxy_image"
docker network connect --ip 172.30.41.3 verimtomu-private verimtomu-ai-proxy
# This exception grants the app access only to its fixed relay, not the Internet.
python3 - "$release/firewall-before" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
line='iptables -C DOCKER-USER -s 172.30.41.2/32 -d 172.30.41.3/32 -p tcp --dport 8080 -j ACCEPT 2>/dev/null || iptables -I DOCKER-USER 1 -s 172.30.41.2/32 -d 172.30.41.3/32 -p tcp --dport 8080 -j ACCEPT\n'
s+='\n'+line
Path('/usr/local/sbin/verimtomu-app-firewall').write_text(s)
PY
/usr/local/sbin/verimtomu-app-firewall
docker stop verimtomu-web
docker rename verimtomu-web verimtomu-web-before-ai
changed=true
docker run -d --name verimtomu-web --network verimtomu-private --ip 172.30.41.2 \
 --env-file /opt/verimtomu/env/app.env --env-file /opt/verimtomu/env/ai.env \
 --env-file /opt/verimtomu/env/openai-key.env -e GUARD_TRUSTED_PROXY_IP=172.30.41.1 \
 --mount type=bind,src=/opt/verimtomu/ai-data,dst=/app/data \
 --restart unless-stopped --read-only --cap-drop ALL --security-opt no-new-privileges:true \
 --memory 512m --cpu-period 20000 --cpu-quota 10000 --pids-limit 64 \
 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m --log-driver local \
 --log-opt max-size=10m --log-opt max-file=3 "$image"
ready=false
for attempt in $(seq 1 20); do
 if curl --silent --fail --max-time 3 http://172.30.41.2:3000/api/health > "$release/health.json"; then ready=true; break; fi
 sleep 1
done
test "$ready" = true
python3 - "$release/health.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]));assert r['ai_configured'] is True and r['provider_label']=='OpenAI'
PY
# Verify the app can reach its relay but still cannot reach the host/Internet.
docker exec verimtomu-web node --input-type=module -e 'import net from "node:net";const r=await fetch("http://172.30.41.3:8080/health",{signal:AbortSignal.timeout(3000)});if(!r.ok)process.exit(1);for(const [host,port]of [["172.30.41.1",22],["169.254.169.254",80],["api.openai.com",443]]){const reached=await new Promise(resolve=>{const s=net.createConnection({host,port});const done=v=>{s.destroy();resolve(v);};s.setTimeout(2000,()=>done(false));s.once("error",()=>done(false));s.once("connect",()=>done(true));});if(reached)process.exit(1);}'
python3 "$release/smoke.py"
trap - ERR
printf '%s\n' "$image" > "$release/image-id"
printf '%s\n' "$release" > /opt/verimtomu/repair-validation/live-release
echo 'AI READY: visitor quota 3/24h, daily budget 5 USD, fixed OpenAI relay, persistent counters.'
