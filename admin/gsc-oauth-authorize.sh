#!/usr/bin/env bash
# Stage 10: one-time Google Search Console OAuth authorization on the VPS (run manually as root).
# The refresh token is created on the VPS and stored only in /opt/verimtomu/admin-secrets (0400, UID 1000).
#   1. On your computer:   ssh -L 8765:127.0.0.1:8765 root@<vps>
#   2. In that session:    bash admin/gsc-oauth-authorize.sh /root/gsc-oauth-client.json
#   3. Open the printed URL in your browser, sign in, allow "See Search Console data".
# Runs the tool in the deployed admin image (read-only, no capabilities, 192 MB, 0.25 CPU) on the admin
# network; publishes the callback port only on 127.0.0.1. Never prints a secret; never overwrites.
set +x
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Spusťte jako root.'; exit 1; }
src=${1:-}
[[ -n "$src" && -f "$src" && ! -L "$src" ]] || { echo 'Zadejte cestu k nahranému JSON souboru OAuth klienta (ne symlink).'; exit 1; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
tool="$here/tools/gsc-oauth-authorize.mjs"
[[ -f "$tool" ]] || { echo 'Chybí tools/gsc-oauth-authorize.mjs (spusťte z checkoutu release).'; exit 1; }
secrets=/opt/verimtomu/admin-secrets
target=$secrets/gsc-oauth.json
[[ ! -e "$target" && ! -L "$target" ]] || { echo "Soubor $target už existuje; nic nepřepsáno. Pro novou autorizaci ho nejdřív odstraňte (runbook)."; exit 1; }
container=verimtomu-admin-staging
image=$(docker inspect "$container" --format '{{.Config.Image}}') || { echo "Kontejner $container nenalezen."; exit 1; }
network=$(docker inspect "$container" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | awk '{print $1}')
[[ -n "$network" ]] || { echo 'Síť kontejneru nenalezena.'; exit 1; }

umask 077
install -d -o root -g root -m 0700 "$secrets"
work=$(mktemp -d "$secrets/.oauth.XXXXXX")
in=$(mktemp -d)
cleanup(){ find "$work" "$in" -type f -exec shred -u {} + 2>/dev/null || true; rm -rf "$work" "$in"; }
trap cleanup EXIT
install -o 1000 -g 1000 -m 0400 "$src" "$in/client.json"
chown 1000:1000 "$in" "$work"; chmod 0500 "$in"; chmod 0700 "$work"

docker run --rm -it --name verimtomu-gsc-oauth --user 1000:1000 --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --memory 192m --cpus 0.25 --pids-limit 64 \
  --network "$network" -p 127.0.0.1:8765:8765 \
  -v "$in":/in:ro -v "$work":/out -v "$here/tools":/tools:ro \
  --entrypoint node "$image" /tools/gsc-oauth-authorize.mjs /in/client.json /out/gsc-oauth.json --listen 0.0.0.0 --port 8765

[[ -f "$work/gsc-oauth.json" ]] || { echo 'Autorizace nedokončena; nic neuloženo.'; exit 1; }
mv -n "$work/gsc-oauth.json" "$target"
[[ -f "$target" && ! -e "$work/gsc-oauth.json" ]] || { echo 'Přesun se nezdařil; nic nepřepsáno.'; exit 1; }
chown 1000:1000 "$target"
chmod 0400 "$target"
if command -v shred >/dev/null; then shred -u "$src"; else rm -f "$src"; fi
echo "Refresh token uložen do $target (0400, UID 1000); nahraný soubor klienta odstraněn. Dashboard nebyl restartován."
