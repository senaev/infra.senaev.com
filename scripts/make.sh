#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a
set -a; source "$ROOT_DIR/$PROVISIONING_PATH_LOCAL/.env"; set +a

echo "👉 Starting deployment to production server"

echo "👉 Syncing provisioning files to server"
ssh "$REMOTE_SERVER_ADDRESS" "mkdir -p $K3S_CLUSTER_PATH"
rsync -avz --delete -e ssh "$ROOT_DIR/$PROVISIONING_PATH_LOCAL/" "$REMOTE_SERVER_ADDRESS:$PROVISIONING_PATH_REMOTE/"
echo "✅ Provisioning files synced"

echo "👉 Deploying k8s cluster to server"
ssh "$REMOTE_SERVER_ADDRESS" "$PROVISIONING_PATH_REMOTE/control-plane/scripts/deploy-k8s.sh"
echo "✅ k8s cluster deployed to server"

echo "🏁 Deployment completed successfully!"