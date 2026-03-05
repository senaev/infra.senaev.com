#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

echo "👉 [connect-all-workers] Getting NODE_TOKEN from control plane node"
NODE_TOKEN=$(ssh "$REMOTE_SERVER_ADDRESS" "cat /var/lib/rancher/k3s/server/node-token")
echo "✅ [connect-all-workers] NODE_TOKEN=[${NODE_TOKEN:0:4}...${NODE_TOKEN: -4}]"

echo "👉 [connect-all-workers] Connecting to worked nodes"
while read -r addr labels; do
  [[ -z "$addr" ]] && continue
  echo "👉 [connect-all-workers] Connecting to node=[$addr] with labels=[${labels}]"

  "$ROOT_DIR/scripts/connect-worker.sh" "$NODE_TOKEN" "$addr" "$labels"

  echo "✅ [connect-all-workers] Connected to node=[$addr] with labels=[${labels}]"
done <<< "$WORKERS"
echo "✅ [connect-all-workers] Connected to worked nodes"