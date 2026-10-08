#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
IMAGE=$(cat "$DEPLOY_ROOT/previous-image")
[[ "$IMAGE" =~ ^verimtomu:[a-f0-9]{40}$ ]]
REV=${IMAGE#verimtomu:}
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE")" = "$REV"
activate_image "$IMAGE"
save_image
echo 'App rollback PASS. No other service, tunnel, network or data was changed.'
