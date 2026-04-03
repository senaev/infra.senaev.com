#!/usr/bin/env bash
set -euo pipefail

# Bootstrap k3s worker. If all conditions are satisfied, do nothing; otherwise uninstall and reinstall.
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <vps>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 yc" >&2
  exit 1
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"
VPS="$3"
LABELS="vps=${VPS}"

LOG_PREFIX="[bootstrap-worker $VPS]"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../common/.env"; set +a

echo "👉 $LOG_PREFIX Bootstrapping worker with vps=[${VPS}] to control plane=[$CONTROL_PLANE_SERVER_URL]"
if bash "$SCRIPT_DIR/check-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$VPS"; then
  echo "✅ $LOG_PREFIX Worker is OK"
  exit 0
else
  echo "👉 $LOG_PREFIX Worker is NOT OK, k3s needs to be reinstalled"
fi

if [[ -f /usr/local/bin/k3s-agent-uninstall.sh ]]; then
  echo "👉 $LOG_PREFIX Uninstalling existing k3s agent"
  sudo /usr/local/bin/k3s-agent-uninstall.sh
  echo "✅ $LOG_PREFIX Uninstalled existing k3s agent"
else
  echo "✅ $LOG_PREFIX k3s-agent-uninstall.sh not found"
fi

echo "👉 $LOG_PREFIX Cleaning stale k3s worker state"
sudo systemctl stop k3s-agent 2>/dev/null || true
sudo systemctl reset-failed k3s-agent 2>/dev/null || true
echo "✅ $LOG_PREFIX Cleaned stale k3s worker state"

echo "👉 $LOG_PREFIX Building node labels from vps=[${VPS}]"
NODE_LABEL_ARGS=()
if [[ -n "$VPS" ]]; then
  NODE_LABEL_ARGS+=(--node-label "$LABELS")
fi
NODE_LABEL_ARGS_STR="${NODE_LABEL_ARGS[*]}"
echo "✅ $LOG_PREFIX NODE_LABEL_ARGS=[${NODE_LABEL_ARGS_STR}]"

echo "👉 $LOG_PREFIX Getting internal tailnet IP"
TAILNET_IP=$(tailscale ip -4)
echo "✅ $LOG_PREFIX TAILNET_IP=[${TAILNET_IP}]"

echo "👉 $LOG_PREFIX Checking control plane reachability"
if ! curl -skf --connect-timeout 10 "${CONTROL_PLANE_SERVER_URL}/ping" >/dev/null; then
  echo "❌ $LOG_PREFIX Control plane is not reachable at [${CONTROL_PLANE_SERVER_URL}]"
  exit 1
fi
echo "✅ $LOG_PREFIX Control plane is reachable"

echo "👉 $LOG_PREFIX Installing k3s=[${K3S_VERSION}] agent ⚠️ might take a while, wait"

install_k3s_agent() {
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="${K3S_VERSION}" \
    K3S_URL="$CONTROL_PLANE_SERVER_URL" \
    K3S_TOKEN="$NODE_TOKEN" \
    INSTALL_K3S_EXEC=" \
      agent \
      $NODE_LABEL_ARGS_STR \
      --node-external-ip=$TAILNET_IP \
      --flannel-iface=tailscale0 \
    " \
    sh -
}

wait_for_k3s_agent_start() {
  local deadline
  deadline=$((SECONDS + 120))

  while (( SECONDS < deadline )); do
    if sudo systemctl is-active --quiet k3s-agent; then
      return 0
    fi
    sleep 5
  done

  return 1
}

if ! install_k3s_agent || ! wait_for_k3s_agent_start; then
  echo "⚠️ $LOG_PREFIX k3s agent did not start within 2 minutes, retrying once"
  install_k3s_agent
  wait_for_k3s_agent_start
fi

echo "✅ $LOG_PREFIX Installed k3s agent"
