#!/usr/bin/env bash
set -euo pipefail

# Bootstrap k3s worker. If all conditions are satisfied, do nothing; otherwise uninstall and reinstall.
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <labels>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 label1=value1,label2=value2" >&2
  exit 1
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"
LABELS="$3"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "👉 [bootstrap-worker] Bootstrapping worker with labels=[${LABELS}]"

if bash "$SCRIPT_DIR/check-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$LABELS"; then
  echo "✅ [bootstrap-worker] Worker is OK"
  exit 0
else
  echo "👉 [bootstrap-worker] Worker is NOT OK, requiring reinstall"
fi

if [[ -f /usr/local/bin/k3s-agent-uninstall.sh ]]; then
  echo "👉 [bootstrap-worker] Uninstalling existing k3s agent"
  sudo /usr/local/bin/k3s-agent-uninstall.sh
  echo "✅ [bootstrap-worker] Uninstalled existing k3s agent"
else
  echo "✅ [bootstrap-worker] k3s-agent-uninstall.sh not found"
fi

echo "👉 [bootstrap-worker] Parsing labels=[${LABELS}]"
NODE_LABEL_ARGS=()
if [[ -n "$LABELS" ]]; then
  IFS=',' read -ra parts <<< "$LABELS"
  for p in "${parts[@]}"; do
    p="${p// /}"
    [[ -n "$p" ]] && NODE_LABEL_ARGS+=(--node-label "$p")
  done
fi
echo "✅ [bootstrap-worker] NODE_LABEL_ARGS=[${NODE_LABEL_ARGS[*]}]"

echo "👉 [bootstrap-worker] Installing k3s agent"
curl -sfL https://get.k3s.io | \
  K3S_URL="$CONTROL_PLANE_SERVER_URL" \
  K3S_TOKEN="$NODE_TOKEN" \
  sh -s - agent "${NODE_LABEL_ARGS[@]}"
echo "✅ [bootstrap-worker] Installed k3s agent"
