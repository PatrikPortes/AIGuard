#!/usr/bin/env bash
# Run manually on the VPS. Never pass the token in argv or enable tracing.
set +x
set -euo pipefail
[[ $(id -u) -eq 0 && -t 0 ]] || { echo 'Spusťte jako root v interaktivním terminálu.'; exit 1; }
target=/opt/verimtomu/admin-secrets/cloudflare-token
[[ ! -e "$target" && ! -L "$target" ]] || { echo 'Soubor již existuje; nic nepřepsáno.'; exit 1; }
read -r -s -p 'Vlož Analytics token (vstup se nezobrazuje): ' analytics_token
printf '\n'
[[ $analytics_token =~ ^[A-Za-z0-9_-]{20,256}$ ]] || { unset analytics_token; echo 'Neplatný formát.'; exit 1; }
umask 077
install -d -o root -g root -m 0700 /opt/verimtomu/admin-secrets
# noclobber protects against an unexpected existing file.
(set -o noclobber; printf '%s' "$analytics_token" > "$target")
unset analytics_token
chown 1000:1000 "$target"
chmod 0400 "$target"
echo 'Analytics token bezpečně uložen. Dashboard nebyl spuštěn.'
