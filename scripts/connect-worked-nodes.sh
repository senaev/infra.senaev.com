#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && cd .. && pwd)"
set -a; source "$ROOT_DIR/provisioning/k8s/scripts/.env"; set +a
set -a; source "$ROOT_DIR/.env"; set +a

echo "👉 Getting NODE_TOKEN from control plane node"
NODE_TOKEN=$(ssh "$REMOTE_SERVER_ADDRESS" "cat /var/lib/rancher/k3s/server/node-token")
echo "✅ NODE_TOKEN=[${NODE_TOKEN:0:4}...${NODE_TOKEN: -4}]"

while read -r addr labels; do
  [[ -z "$addr" ]] && continue

  IFS=',' read -ra label_arr <<< "$labels"

  echo "node=$addr"

  # example: iterate labels
  for kv in "${label_arr[@]}"; do
    echo " -> $kv"
  done

done <<< "$K3S_WORKERS"
