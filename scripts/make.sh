#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

echo "👉 [make] Starting deployment to production server"

echo "👉 [make] Rsyncing provisioning files to server"
$ROOT_DIR/scripts/rsync-provisioning.sh "$CONTROL_PLANE_SERVER_ADDRESS"
echo "✅ [make] Provisioning files synced"

CONTROL_PLANE_SERVER_ADDRESS="$CONTROL_PLANE_SERVER_USERNAME@$CONTROL_PLANE_SERVER_IP"
echo "👉 [make] Deploying k8s cluster to server=[$CONTROL_PLANE_SERVER_ADDRESS]"
ssh "$CONTROL_PLANE_SERVER_ADDRESS" "$PROVISIONING_PATH_LOCAL_TO_REMOTE/control-plane/scripts/bootstrap-control-plane.sh"
echo "✅ [make] k8s cluster deployed to server"

echo "✅ [make] Deployment completed successfully!"