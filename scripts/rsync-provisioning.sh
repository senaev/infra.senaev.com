#!/usr/bin/env bash
set -euo pipefail

# Syncs provisioning files to server.
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <address>" >&2
  echo "Example: $0 root@11.111.111.111" >&2
  exit 1
fi

ADDRESS="$1"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

PROVISIONING_PATH="$K3S_CLUSTER_PATH/provisioning"
REMOTE_DEST="$ADDRESS:$PROVISIONING_PATH/"

echo "👉 [rsync-provisioning] Creating k3s cluster path on [$REMOTE_DEST]"
ssh "$ADDRESS" "sudo mkdir -p $K3S_CLUSTER_PATH && sudo chown -R \$USER:\$USER $K3S_CLUSTER_PATH"
echo "✅ [rsync-provisioning] k3s cluster path created on [$REMOTE_DEST]"

echo "👉 [rsync-provisioning] Creating provisioning directory on [$REMOTE_DEST]"
ssh "$ADDRESS" "mkdir -p $PROVISIONING_PATH"
echo "✅ [rsync-provisioning] Provisioning directory created on [$REMOTE_DEST]"

echo "👉 [rsync-provisioning] Rsyncing provisioning files to [$REMOTE_DEST]"
rsync -avz --delete -e ssh "$ROOT_DIR/provisioning/" "$REMOTE_DEST"
echo "✅ [rsync-provisioning] Provisioning files rsynced to [$REMOTE_DEST]"
