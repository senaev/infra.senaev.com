#!/usr/bin/env bash
set -euo pipefail

# Bootstrap k3s worker. If all conditions are satisfied, do nothing; otherwise uninstall and reinstall.
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <vps>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 vps_name" >&2
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

  # Applied even when the worker needs no reinstall - a healthy k3s-agent is precisely the
  # case that can still be missing the tailscale0 binding. Deliberately NOT part of
  # check-worker.sh: a failed check there triggers a full uninstall/reinstall, and this
  # condition only ever warrants a config refresh.
  bash "$SCRIPT_DIR/../common/bootstrap-node-networking.sh" k3s-agent

  exit 0
else
  echo "👉 $LOG_PREFIX Worker is NOT OK, k3s needs to be reinstalled"
fi

# Both checks run before the uninstall, so a failure leaves the existing agent untouched.
bash "$SCRIPT_DIR/../common/check-tailscale-dual-stack.sh"

check_control_plane_reachability() {
  curl -skSf \
    --connect-timeout 5 \
    --max-time 15 \
    "${CONTROL_PLANE_SERVER_URL}/ping" >/dev/null
}

# Never restart tailscaled here: on a flaky uplink the node may not get the coordination
# server back for many minutes, and the home nodes cannot be recovered without the tailnet.
# See tasks/2026-10-04-k3s-dual-stack-ipv6.md (2026-10-05 outage).
CONTROL_PLANE_WAIT_SEC=300
CONTROL_PLANE_RETRY_SEC=10
echo "👉 $LOG_PREFIX Checking control plane reachability at [${CONTROL_PLANE_SERVER_URL}] (up to ${CONTROL_PLANE_WAIT_SEC}s)"
CONTROL_PLANE_DEADLINE=$((SECONDS + CONTROL_PLANE_WAIT_SEC))
until check_control_plane_reachability; do
  if (( SECONDS >= CONTROL_PLANE_DEADLINE )); then
    echo "❌ $LOG_PREFIX Control plane is not reachable at [${CONTROL_PLANE_SERVER_URL}] after ${CONTROL_PLANE_WAIT_SEC}s"
    echo "❌ $LOG_PREFIX Nothing was changed on this node. tailscaled was NOT restarted on purpose."
    echo "❌ $LOG_PREFIX Investigate: tailscale status; tailscale ping <control-plane>; systemctl status k3s (on the control plane)"
    exit 1
  fi
  echo "⏳ $LOG_PREFIX Control plane not reachable yet, retrying in ${CONTROL_PLANE_RETRY_SEC}s"
  sleep "$CONTROL_PLANE_RETRY_SEC"
done
echo "✅ $LOG_PREFIX Control plane is reachable"

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

# No node IPs are passed: with --flannel-iface, k3s reads them from tailscale0 on every start.
echo "👉 $LOG_PREFIX Installing k3s=[${K3S_VERSION}] agent ⚠️ might take a while, wait"

curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="${K3S_VERSION}" \
    K3S_URL="$CONTROL_PLANE_SERVER_URL" \
    K3S_TOKEN="$NODE_TOKEN" \
    INSTALL_K3S_EXEC=" \
      agent \
      $NODE_LABEL_ARGS_STR \
      --flannel-iface=tailscale0 \
    " \
    sh -
echo "✅ $LOG_PREFIX Installed k3s agent"

echo "👉 $LOG_PREFIX Hardening node networking (k3s-agent <-> tailscale0 binding)"
bash "$SCRIPT_DIR/../common/bootstrap-node-networking.sh" k3s-agent
echo "✅ $LOG_PREFIX Node networking hardened"
