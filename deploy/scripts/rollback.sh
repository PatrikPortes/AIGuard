#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
IMAGE=$(cat "$DEPLOY_ROOT/previous-image")
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]]
verify_image "$IMAGE"
REV=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")
[[ "$REV" =~ ^[a-f0-9]{40}$ ]]
activate_image "$IMAGE"
save_image
echo 'App rollback PASS. No other service, tunnel, network or data was changed.'
