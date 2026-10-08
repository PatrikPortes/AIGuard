#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
REV=${1:?Usage: deploy.sh APPROVED_FULL_COMMIT_SHA}
[[ "$REV" =~ ^[a-f0-9]{40}$ ]] || { echo 'Full approved commit SHA required' >&2; exit 1; }
test "$(git -C "$DEPLOY_ROOT/source" rev-parse "$REV^{commit}")" = "$REV"
IMAGE="verimtomu:$REV"
PREVIOUS=
CONTAINER=$(compose ps -a -q app)
if [[ -n "$CONTAINER" ]]; then
  PREVIOUS=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER")
  [[ "$PREVIOUS" =~ ^verimtomu:[a-f0-9]{40}$ ]]
fi
mkdir -p "$DEPLOY_ROOT/app"
# A fresh export from the approved commit; never build uncommitted working-directory code.
BUILD_DIR=$(mktemp -d "$DEPLOY_ROOT/app/$REV.XXXXXX")
git -C "$DEPLOY_ROOT/source" archive "$REV" | tar -x -C "$BUILD_DIR"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build --build-arg "NODE_IMAGE=$NODE_IMAGE" --build-arg "RUNTIME_IMAGE=$RUNTIME_IMAGE" --build-arg "VCS_REF=$REV" --tag "$IMAGE" "$BUILD_DIR"
fi
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")" = "$REV"
INGRESS_IP=$(read_setting VERIM_INGRESS_IP)
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 256m --cpus 0.25 --pids-limit 32 --env-file "$DEPLOY_ROOT/env/app.env" \
  -e "GUARD_TRUSTED_PROXY_IP=$INGRESS_IP" "$IMAGE" node scripts/production-guard.js
if ! activate_image "$IMAGE"; then
  echo 'New app release failed; restoring only verimtomu app' >&2
  if [[ -n "$PREVIOUS" ]]; then activate_image "$PREVIOUS"; else compose stop app; fi
  exit 1
fi
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$IMAGE" ]]; then
  printf '%s\n' "$PREVIOUS" > "$DEPLOY_ROOT/previous-image"
  chmod 600 "$DEPLOY_ROOT/previous-image"
fi
save_image
echo 'Local release PASS. HTTPS smoke remains required; connector was not started or restarted.'
