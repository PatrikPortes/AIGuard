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
  PREVIOUS=$(docker inspect --format '{{.Image}}' "$CONTAINER")
  [[ "$PREVIOUS" =~ ^sha256:[a-f0-9]{64}$ ]]
  test "$PREVIOUS" = "$VERIM_APP_IMAGE"
  verify_image "$PREVIOUS"
fi
mkdir -p "$DEPLOY_ROOT/app"
# A fresh export from the approved commit; never build uncommitted working-directory code.
BUILD_DIR=$(mktemp -d "$DEPLOY_ROOT/app/$REV.XXXXXX")
git -C "$DEPLOY_ROOT/source" archive "$REV" | tar -x -C "$BUILD_DIR"
# Never trust a cached mutable SHA-like tag or its self-asserted revision label.
# Build from this clean archive every time; Docker may reuse verified build layers.
docker build --platform linux/amd64 --iidfile "$BUILD_DIR/image-id" --build-arg "NODE_IMAGE=$NODE_IMAGE" --build-arg "RUNTIME_IMAGE=$RUNTIME_IMAGE" --build-arg "VCS_REF=$REV" --tag "$IMAGE" "$BUILD_DIR"
IMAGE=$(cat "$BUILD_DIR/image-id")
verify_image "$IMAGE"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")" = "$REV"
TREE=$(git -C "$DEPLOY_ROOT/source" rev-parse "$REV^{tree}")
[[ "$TREE" =~ ^[a-f0-9]{40}$ ]]
printf 'source_commit=%s\nsource_tree=%s\nimage_id=%s\nnode_base=%s\nruntime_base=%s\n' "$REV" "$TREE" "$IMAGE" "$NODE_IMAGE" "$RUNTIME_IMAGE" > "$BUILD_DIR/release-manifest"
chmod 600 "$BUILD_DIR/release-manifest"
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
