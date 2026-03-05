#!/usr/bin/env bash
set -euo pipefail

# Syncs provisioning files to server.
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <address>" >&2
  echo "Example: $0 ubuntu@11.111.111.111" >&2
  exit 1
fi

ADDRESS="$1"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

echo "👉 Syncing provisioning files to server=[$ADDRESS]"
ssh "$REMOTE_SERVER_ADDRESS" "mkdir -p $K3S_CLUSTER_PATH"
rsync -avz --delete -e ssh "$ROOT_DIR/$PROVISIONING_PATH_LOCAL/" "$REMOTE_SERVER_ADDRESS:$PROVISIONING_PATH_REMOTE/"
echo "✅ Provisioning files synced"
