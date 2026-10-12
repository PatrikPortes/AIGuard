#!/usr/bin/env bash
set -euo pipefail
set +x
[[ $(id -u) -eq 0 ]] || exit 1
umask 077
install -d -m 700 /opt/verimtomu/env
read -r -s -p 'Vlož OpenAI API klíč (nebude vidět): ' verim_api_key </dev/tty
printf '\n' >/dev/tty
if [[ ! $verim_api_key =~ ^sk-[A-Za-z0-9_-]{20,}$ ]]; then
  unset verim_api_key
  echo 'Klíč nemá očekávaný formát. Nic nebylo změněno.'
  exit 1
fi
verim_key_file=$(mktemp /opt/verimtomu/env/.openai-key.XXXXXX)
trap 'rm -f "$verim_key_file"' EXIT
printf 'OPENAI_API_KEY=%s\n' "$verim_api_key" > "$verim_key_file"
unset verim_api_key
chmod 600 "$verim_key_file"
chown root:root "$verim_key_file"
mv -f "$verim_key_file" /opt/verimtomu/env/openai-key.env
trap - EXIT
echo 'API klíč bezpečně uložen. AI zatím není zapnutá.'
