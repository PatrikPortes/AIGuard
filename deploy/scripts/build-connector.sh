#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
REV=${1:?Usage: build-connector.sh APPROVED_FULL_COMMIT_SHA}
[[ "$REV" =~ ^[a-f0-9]{40}$ ]]
test "$(git -C "$DEPLOY_ROOT/source" rev-parse "$REV^{commit}")" = "$REV"
IMAGE="verimtomu-cloudflared:$REV"
mkdir -p "$DEPLOY_ROOT/app"
BUILD_DIR=$(mktemp -d "$DEPLOY_ROOT/app/connector-$REV.XXXXXX")
git -C "$DEPLOY_ROOT/source" archive "$REV" | tar -x -C "$BUILD_DIR"
docker build --platform linux/amd64 --iidfile "$BUILD_DIR/image-id" -f "$BUILD_DIR/Dockerfile.cloudflared" --build-arg "CONNECTOR_SOURCE=$CONNECTOR_SOURCE" \
  --build-arg "CONNECTOR_RUNTIME=$CONNECTOR_RUNTIME" --build-arg "VCS_REF=$REV" --tag "$IMAGE" "$BUILD_DIR"
IMAGE=$(cat "$BUILD_DIR/image-id")
verify_image "$IMAGE"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")" = "$REV"
printf 'source_commit=%s\nimage_id=%s\nvendor_base=%s\nruntime_base=%s\n' "$REV" "$IMAGE" "$CONNECTOR_SOURCE" "$CONNECTOR_RUNTIME" > "$BUILD_DIR/release-manifest"
chmod 600 "$BUILD_DIR/release-manifest"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 256m --cpus 0.25 --pids-limit 32 "$IMAGE" --version
printf 'Connector candidate image ID: %s\n' "$IMAGE"
echo 'Connector image built only. Scan/review and explicit human activation remain required.'
