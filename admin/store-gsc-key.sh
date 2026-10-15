#!/usr/bin/env bash
# Stage 10: run manually on the VPS as root. Moves a downloaded Search Console service-account key
# into the admin secrets directory with minimal permissions. Never prints the key; never overwrites.
#   bash store-gsc-key.sh /root/gsc-key-upload.json
set +x
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Spusťte jako root.'; exit 1; }
src=${1:-}
[[ -n "$src" && -f "$src" && ! -L "$src" ]] || { echo 'Zadejte cestu k nahranému JSON souboru (ne symlink).'; exit 1; }
target=/opt/verimtomu/admin-secrets/gsc-service-account.json
[[ ! -e "$target" && ! -L "$target" ]] || { echo 'Soubor již existuje; nic nepřepsáno.'; exit 1; }
# Structure check only (no output of values): service account, iam email, PKCS#8 key, Google token URI.
python3 - "$src" <<'PY' || { echo 'Soubor není platný klíč service accountu.'; exit 1; }
import json,re,sys,os
p=sys.argv[1]
if os.path.getsize(p)>16384: sys.exit(1)
d=json.load(open(p))
ok=(d.get('type')=='service_account' and re.fullmatch(r'[a-z0-9-]{6,30}@[a-z0-9-]{6,30}\.iam\.gserviceaccount\.com',d.get('client_email','')) is not None
    and str(d.get('private_key','')).startswith('-----BEGIN PRIVATE KEY-----') and d.get('token_uri','https://oauth2.googleapis.com/token')=='https://oauth2.googleapis.com/token')
sys.exit(0 if ok else 1)
PY
umask 077
install -d -o root -g root -m 0700 /opt/verimtomu/admin-secrets
(set -o noclobber; cat "$src" > "$target")
chown 1000:1000 "$target"
chmod 0400 "$target"
if command -v shred >/dev/null; then shred -u "$src"; else rm -f "$src"; fi
echo 'Klíč Search Console bezpečně uložen; nahraný soubor odstraněn. Dashboard nebyl restartován.'
