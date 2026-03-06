#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

CONTROL_PLANE_SERVER_ADDRESS="$CONTROL_PLANE_SERVER_USERNAME@$CONTROL_PLANE_SERVER_IP"
CONTROL_PLANE_SERVER_URL="https://$CONTROL_PLANE_SERVER_IP:$CONTROL_PLANE_SERVER_PORT"
echo "👉 [connect-all-workers] Getting NODE_TOKEN from control plane address=[$CONTROL_PLANE_SERVER_ADDRESS] url=[$CONTROL_PLANE_SERVER_URL]"
NODE_TOKEN=$(ssh "$CONTROL_PLANE_SERVER_ADDRESS" "cat /var/lib/rancher/k3s/server/node-token")
echo "✅ [connect-all-workers] NODE_TOKEN.length=[${#NODE_TOKEN}]"

echo "👉 [connect-all-workers] Connecting to worker nodes"
echo "$WORKERS" | jq -c '.[]' | while read -r obj; do
  addr="$(echo "$obj" | jq -r '"\(.username)@\(.host)"')"
  labels="$(echo "$obj" | jq -r '.labels')"
  echo "👉 [connect-all-workers] Connecting to node=[$addr] with labels=[${labels}]"

  "$ROOT_DIR/scripts/connect-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$addr" "$labels"

  echo "✅ [connect-all-workers] Connected to node=[$addr] with labels=[${labels}]"
done
echo "✅ [connect-all-workers] Connected to worker nodes"