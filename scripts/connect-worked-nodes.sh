#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a
set -a; source "$ROOT_DIR/$PROVISIONING_CONTROL_PLANE_ENV_PATH"; set +a

echo "👉 Getting NODE_TOKEN from control plane node"
NODE_TOKEN=$(ssh "$REMOTE_SERVER_ADDRESS" "cat /var/lib/rancher/k3s/server/node-token")
echo "✅ NODE_TOKEN=[${NODE_TOKEN:0:4}...${NODE_TOKEN: -4}]"

echo "👉 Connecting to worked nodes"
while read -r addr labels; do
  [[ -z "$addr" ]] && continue
  echo "👉 Connecting to node=[$addr] with labels=[${labels}]"

  "$ROOT_DIR/scripts/connect-worker-node.sh" "$NODE_TOKEN" "$addr" "$labels"

  echo "✅ Connected to node=[$addr] with labels=[${labels}]"
done <<< "$WORKERS"
echo "✅ Connected to worked nodes"