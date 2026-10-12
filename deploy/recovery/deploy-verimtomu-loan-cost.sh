#!/usr/bin/env bash
set -Eeuo pipefail
[ "$(id -u)" -eq 0 ] || exit 1
base=sha256:b4ff1b59b8bfb80ad439fe777807ed4068a7a0dabf4135ffbdc7799958404dc5
if [ "$(docker inspect verimtomu-web --format '{{.Image}}')" != "$base" ]; then echo "STOP: running version differs from the expected release."; exit 1; fi
if docker inspect verimtomu-web-before-loan-cost >/dev/null 2>&1; then echo 'Previous UX rollback already exists; stopped to preserve it.'; exit 1; fi
printf '%s\n' '235478850bcc04c06bbca7e4099d69700619d19f19eb2efdde21b8e92d71789e  /tmp/verimtomu-loan-cost.tar.gz' | sha256sum -c -
release=$(mktemp -d /opt/verimtomu/repair-validation/ux.XXXXXX)
tar -xzf /tmp/verimtomu-loan-cost.tar.gz -C "$release"
docker tag "$base" verimtomu-ux-base:local
cat > "$release/Dockerfile" <<'EOF'
FROM verimtomu-ux-base:local
LABEL org.opencontainers.image.revision="6db985fcd2602916cb3941aaae9d48f22661d0cb+local-repair+ux+welcome+contact+flows+brand+ai+texts+loan-cost"
COPY --chown=65532:65532 src/server.js /app/src/server.js
COPY --chown=65532:65532 public/ /app/public/
EOF
chmod -R a+rX "$release"
docker build --network none --pull=false -t verimtomu-web:ux "$release"
image=$(docker image inspect verimtomu-web:ux --format '{{.Id}}')
printf '%s\n' "$image" > "$release/image-id"
find "$release/public" -type f -exec sha256sum {} + > "$release/source-manifest"
docker stop verimtomu-web
docker rename verimtomu-web verimtomu-web-before-loan-cost
rollback() { docker rm -f verimtomu-web >/dev/null 2>&1 || true; docker rename verimtomu-web-before-loan-cost verimtomu-web; docker start verimtomu-web >/dev/null; echo 'Previous public application restored.'; }
trap rollback ERR
docker run -d --name verimtomu-web --network verimtomu-private --ip 172.30.41.2 \
  --env-file /opt/verimtomu/env/app.env --env-file /opt/verimtomu/env/ai.env --env-file /opt/verimtomu/env/openai-key.env --mount type=bind,src=/opt/verimtomu/ai-data,dst=/app/data -e GUARD_TRUSTED_PROXY_IP=172.30.41.1 \
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
curl --silent --fail --max-time 5 http://172.30.41.2:3000/overit-zpravu -o "$release/message-response.html"
curl --silent --fail --max-time 5 http://172.30.41.2:3000/proverit-pujcku -o "$release/loan-response.html"
grep -q 'data-flow="message"' "$release/message-response.html"
grep -q 'data-flow="loan"' "$release/loan-response.html"
curl --silent --fail --max-time 5 http://172.30.41.2:3000/loan-cost.js -o "$release/calculator-js-check"
curl --silent --fail --max-time 5 http://172.30.41.2:3000/loan-cost.css -o "$release/calculator-css-check"
grep -q 'id="cost-form"' "$release/loan-response.html"
python3 - "$release/health.json" <<'PYHEALTH'
import json,sys
assert json.load(open(sys.argv[1]))['ai_configured'] is True
PYHEALTH
cat "$release/health.json"
trap - ERR
printf '%s\n' "$release" > /opt/verimtomu/repair-validation/live-release
echo 'LOAN COST READY. Existing domain and tunnel route unchanged.'
