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
set -a; source "$SCRIPT_DIR/../common/.env"; set +a


echo "👉 [bootstrap-worker] Preparing node"
$SCRIPT_DIR/../common/prepare-node.sh
echo "✅ [bootstrap-worker] Node prepared"

echo "👉 [bootstrap-worker] Bootstrapping worker with labels=[${LABELS}] to control plane=[$CONTROL_PLANE_SERVER_URL]"
if bash "$SCRIPT_DIR/check-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$LABELS"; then
  echo "✅ [bootstrap-worker] Worker is OK"
  exit 0
else
  echo "👉 [bootstrap-worker] Worker is NOT OK, k3s needs to be reinstalled"
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
NODE_LABEL_ARGS_STR="${NODE_LABEL_ARGS[*]}"
echo "✅ [bootstrap-worker] NODE_LABEL_ARGS=[${NODE_LABEL_ARGS_STR}]"

# TODO: remove duplications
echo "👉 [bootstrap-worker] getting internal tailnet IP"
TAILNET_IP=$(tailscale ip -4)
echo "✅ [bootstrap-worker] TAILNET_IP=[${TAILNET_IP}]"

echo "👉 [bootstrap-worker] Installing k3s=[${K3S_VERSION}] agent"
curl -sfL https://get.k3s.io | \
  INSTALL_K3S_VERSION="${K3S_VERSION}" \
  K3S_URL="$CONTROL_PLANE_SERVER_URL" \
  K3S_TOKEN="$NODE_TOKEN" \
  INSTALL_K3S_EXEC=" \
    agent \
    $NODE_LABEL_ARGS_STR \
    --node-ip=$TAILNET_IP \
    --flannel-iface=tailscale0 \
  " \
  sh -
echo "✅ [bootstrap-worker] Installed k3s agent"
