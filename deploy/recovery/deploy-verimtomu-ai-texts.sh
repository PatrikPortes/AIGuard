#!/usr/bin/env bash
set -Eeuo pipefail
[ "$(id -u)" -eq 0 ] || exit 1
base=sha256:79c8cf3b9567b25988994bb1473a918d8627f2c352c7275952c21cb592d9f057
if [ "$(docker inspect verimtomu-web --format '{{.Image}}')" != "$base" ]; then echo "STOP: running version differs from the expected release."; exit 1; fi
if docker inspect verimtomu-web-before-ai-texts >/dev/null 2>&1; then echo 'Previous UX rollback already exists; stopped to preserve it.'; exit 1; fi
printf '%s\n' '68f30f9b89d02a974bb0d07ef314e4d3c5d9baf77e84a07283cb9af225a0df28  /tmp/verimtomu-ai-texts.tar.gz' | sha256sum -c -
release=$(mktemp -d /opt/verimtomu/repair-validation/ux.XXXXXX)
tar -xzf /tmp/verimtomu-ai-texts.tar.gz -C "$release"
docker tag "$base" verimtomu-ux-base:local
cat > "$release/Dockerfile" <<'EOF'
FROM verimtomu-ux-base:local
LABEL org.opencontainers.image.revision="6db985fcd2602916cb3941aaae9d48f22661d0cb+local-repair+ux+welcome+contact+flows+brand+ai+texts"
COPY --chown=65532:65532 public/ /app/public/
EOF
chmod -R a+rX "$release"
docker build --network none --pull=false -t verimtomu-web:ux "$release"
image=$(docker image inspect verimtomu-web:ux --format '{{.Id}}')
printf '%s\n' "$image" > "$release/image-id"
find "$release/public" -type f -exec sha256sum {} + > "$release/source-manifest"
docker stop verimtomu-web
docker rename verimtomu-web verimtomu-web-before-ai-texts
rollback() { docker rm -f verimtomu-web >/dev/null 2>&1 || true; docker rename verimtomu-web-before-ai-texts verimtomu-web; docker start verimtomu-web >/dev/null; echo 'Previous public application restored.'; }
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
cat "$release/health.json"
trap - ERR
printf '%s\n' "$release" > /opt/verimtomu/repair-validation/live-release
echo 'AI TEXTS READY. Existing domain and tunnel route unchanged.'
