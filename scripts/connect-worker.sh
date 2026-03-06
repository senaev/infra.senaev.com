#!/usr/bin/env bash
set -euo pipefail

# Connects to the worker at address and runs echo with the given parameters on the remote.
if [[ $# -lt 4 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <address> <labels>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 root@11.111.111.111 label1=value1,label2=value2" >&2
  exit 1
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"
ADDRESS="$3"
LABELS="$4"

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

echo "👉 [connect-worker] Rsyncing provisioning files for worker=[$ADDRESS]"
"$ROOT_DIR/scripts/rsync-provisioning.sh" "$ADDRESS"
echo "✅ [connect-worker] Provisioning files synced for worker=[$ADDRESS]"

echo "👉 [connect-worker] Running bootstrap script on node=[$ADDRESS] with labels=[${LABELS}]"
ssh "$ADDRESS" "sudo $PROVISIONING_PATH_LOCAL_TO_REMOTE/worker/scripts/bootstrap-worker.sh $CONTROL_PLANE_SERVER_URL $NODE_TOKEN $LABELS"
echo "✅ [connect-worker] Bootstrap script run on node=[$ADDRESS] with labels=[${LABELS}]"