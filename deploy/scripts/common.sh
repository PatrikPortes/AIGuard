#!/usr/bin/env bash
set -euo pipefail
DEPLOY_ROOT=${VERIM_DEPLOY_ROOT:-/opt/verimtomu}
DEPLOY_ROOT=$(cd "$DEPLOY_ROOT" && pwd -P)
# Serialize deployments and rollbacks of this project; never overlap pointer writes.
exec 9>"$DEPLOY_ROOT/release.lock"
flock -n 9 || { echo 'Another AIGuard release operation is running' >&2; exit 1; }
SETTINGS="$DEPLOY_ROOT/env/deployment.env"
test -f "$SETTINGS"
test -f "$DEPLOY_ROOT/env/app.env"
test -f "$DEPLOY_ROOT/compose.yaml"
# Refuse accidental remote Docker contexts; this runbook operates only the local host daemon.
[[ "${DOCKER_HOST:-unix:///var/run/docker.sock}" == unix://* ]]
[[ "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" == unix://* ]]
ENGINE_VERSION=$(docker version --format '{{.Server.Version}}')
ENGINE_MAJOR=${ENGINE_VERSION%%.*}
[[ "$ENGINE_MAJOR" =~ ^[0-9]+$ && "$ENGINE_MAJOR" -ge 28 ]] || { echo 'Docker 28+ required for reviewed isolation baseline' >&2; exit 1; }
# Never source dotenv as shell code; caller environment must not override this project's settings.
unset VERIM_APP_IMAGE VERIM_NODE_IMAGE VERIM_RUNTIME_IMAGE VERIM_CLOUDFLARED_IMAGE VERIM_CLOUDFLARED_SOURCE_IMAGE VERIM_CONNECTOR_RUNTIME_IMAGE VERIM_NETWORK_SUBNET VERIM_APP_IP VERIM_INGRESS_IP
read_setting() {
  local key=$1 value
  value=$(awk -v key="$key" 'index($0,key "=")==1 {print substr($0,length(key)+2)}' "$SETTINGS")
  [[ -n "$value" && "$value" != *$'\n'* && "$value" != *'<'* && "$value" != *'>'* ]] || { echo 'Incomplete deployment settings' >&2; return 1; }
  printf '%s' "$value"
}
NODE_IMAGE=$(read_setting VERIM_NODE_IMAGE)
RUNTIME_IMAGE=$(read_setting VERIM_RUNTIME_IMAGE)
CONNECTOR_IMAGE=$(read_setting VERIM_CLOUDFLARED_IMAGE)
CONNECTOR_SOURCE=$(read_setting VERIM_CLOUDFLARED_SOURCE_IMAGE)
CONNECTOR_RUNTIME=$(read_setting VERIM_CONNECTOR_RUNTIME_IMAGE)
[[ "$NODE_IMAGE" =~ ^node:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}$ ]]
[[ "$RUNTIME_IMAGE" =~ ^gcr.io/distroless/nodejs24-debian13:nonroot@sha256:[a-f0-9]{64}$ ]]
[[ "$CONNECTOR_IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$CONNECTOR_SOURCE" =~ ^cloudflare/cloudflared:[a-zA-Z0-9._-]+@sha256:[a-f0-9]{64}$ ]]
[[ "$CONNECTOR_RUNTIME" =~ ^gcr.io/distroless/static-debian13:nonroot@sha256:[a-f0-9]{64}$ ]]
export VERIM_APP_IMAGE
VERIM_APP_IMAGE=$(read_setting VERIM_APP_IMAGE)
[[ "$VERIM_APP_IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]]
compose() {
  docker compose --project-name verimtomu --project-directory "$DEPLOY_ROOT" --env-file "$SETTINGS" -f "$DEPLOY_ROOT/compose.yaml" "$@"
}
compose config --quiet
verify_image() {
  local image=$1
  [[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
  test "$(docker image inspect --format '{{.Id}}' "$image")" = "$image"
}
activate_image() {
  verify_image "$1" || return 1
  export VERIM_APP_IMAGE=$1
  compose up -d --no-deps --pull never --wait --wait-timeout 90 app || return 1
  compose exec -T app node scripts/deployment-smoke.js local
}
save_image() {
  awk -v image="$VERIM_APP_IMAGE" 'index($0,"VERIM_APP_IMAGE=")==1 {$0="VERIM_APP_IMAGE=" image} {print}' "$SETTINGS" > "$SETTINGS.next"
  chmod 600 "$SETTINGS.next"
  mv "$SETTINGS.next" "$SETTINGS"
}
