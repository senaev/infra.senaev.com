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

REMOTE_DEST="$ADDRESS:$PROVISIONING_PATH_LOCAL_TO_REMOTE/"
echo "👉 [rsync-provisioning] Rsyncing provisioning files to [$REMOTE_DEST]"
ssh "$ADDRESS" "mkdir -p $PROVISIONING_PATH_LOCAL_TO_REMOTE"
rsync -avz --delete -e ssh "$ROOT_DIR/provisioning/" "$REMOTE_DEST"
echo "✅ [rsync-provisioning] Provisioning files rsynced to [$REMOTE_DEST]"
