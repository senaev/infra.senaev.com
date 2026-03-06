#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

CONTROL_PLANE_SERVER_ADDRESS="$CONTROL_PLANE_SERVER_USERNAME@$CONTROL_PLANE_SERVER_IP"
echo "👉 [make] Starting deployment to server=[$CONTROL_PLANE_SERVER_ADDRESS]"

echo "👉 [make] Rsyncing provisioning files to server"
$ROOT_DIR/scripts/rsync-provisioning.sh "$CONTROL_PLANE_SERVER_ADDRESS"
echo "✅ [make] Provisioning files synced"

echo "👉 [make] Deploying k8s cluster to server"
ssh "$CONTROL_PLANE_SERVER_ADDRESS" "$PROVISIONING_PATH_LOCAL_TO_REMOTE/control-plane/scripts/bootstrap-control-plane.sh"
echo "✅ [make] k8s cluster deployed"

echo "👉 [make] Deploying k8s services"
ssh "$CONTROL_PLANE_SERVER_ADDRESS" "$PROVISIONING_PATH_LOCAL_TO_REMOTE/control-plane/scripts/bootstrap-services.sh"
echo "✅ [make] k8s services deployed"

echo "👉 [make] Connecting to worker nodes"
$ROOT_DIR/scripts/connect-all-workers.sh
echo "✅ [make] Worker nodes connected"

echo "✅ [make] Deployment completed successfully!"