#!/usr/bin/env bash
set -euo pipefail

# Connects one worker to the control plane and bootstraps it with the given VPS label.
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <address> <vps>" >&2
  echo "Example: $0 root@11.111.111.111 vps_name" >&2
  exit 1
fi

ADDRESS="$1"
VPS="$2"

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

CONTROL_PLANE_SERVER_ADDRESS="$CONTROL_PLANE_SERVER_USERNAME@$CONTROL_PLANE_SERVER_IP"
LOG_PREFIX="[connect-worker $VPS]"

echo "👉 $LOG_PREFIX Getting NODE_TOKEN from control plane=[$CONTROL_PLANE_SERVER_ADDRESS]"
NODE_TOKEN=$(ssh "$CONTROL_PLANE_SERVER_ADDRESS" "cat /var/lib/rancher/k3s/server/node-token")
echo "✅ $LOG_PREFIX NODE_TOKEN.length=[${#NODE_TOKEN}]"

echo "👉 $LOG_PREFIX Getting tailnet address of the control plane"
TAILNET_ADDRESS=$(ssh "$CONTROL_PLANE_SERVER_ADDRESS" "tailscale ip -4")
CONTROL_PLANE_SERVER_URL="https://$TAILNET_ADDRESS:$CONTROL_PLANE_SERVER_PORT"
echo "✅ $LOG_PREFIX CONTROL_PLANE_SERVER_URL=[${CONTROL_PLANE_SERVER_URL}]"

echo "👉 $LOG_PREFIX Rsyncing provisioning files for worker=[$ADDRESS]"
"$ROOT_DIR/scripts/rsync-provisioning.sh" "$ADDRESS"
echo "✅ $LOG_PREFIX Provisioning files synced for worker=[$ADDRESS]"

echo "👉 $LOG_PREFIX Running bootstrap script on node=[$ADDRESS]"
ssh -J "$CONTROL_PLANE_SERVER_ADDRESS" "$ADDRESS" "sudo $K3S_CLUSTER_PATH/provisioning/worker/bootstrap-worker.sh $CONTROL_PLANE_SERVER_URL $NODE_TOKEN $VPS"
echo "✅ $LOG_PREFIX Bootstrap script run on node=[$ADDRESS]"

# The home nodes cannot be recovered without the tailnet, so prove that the node is still
# reachable through the jump host before anyone moves on to the next node.
echo "👉 $LOG_PREFIX Verifying that node=[$ADDRESS] is still reachable over SSH via the control plane"
if ssh -o ConnectTimeout=15 -J "$CONTROL_PLANE_SERVER_ADDRESS" "$ADDRESS" true; then
  echo "✅ $LOG_PREFIX Node=[$ADDRESS] is reachable"
else
  echo "❌ $LOG_PREFIX Node=[$ADDRESS] is NOT reachable after bootstrap - stop and investigate before touching any other node"
  exit 1
fi
