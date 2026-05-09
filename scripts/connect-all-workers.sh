#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../" && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

CONTROL_PLANE_SERVER_ADDRESS="$CONTROL_PLANE_SERVER_USERNAME@$CONTROL_PLANE_SERVER_IP"

echo "👉 [connect-all-workers] Connect all workers to the control plane with address=[$CONTROL_PLANE_SERVER_ADDRESS]"

echo "👉 [connect-all-workers] Getting NODE_TOKEN from control plane"
NODE_TOKEN=$(ssh "$CONTROL_PLANE_SERVER_ADDRESS" "cat /var/lib/rancher/k3s/server/node-token")
echo "✅ [connect-all-workers] NODE_TOKEN.length=[${#NODE_TOKEN}]"

echo "👉 [connect-all-workers] Getting tailnet address of the control plane"
TAILNET_ADDRESS=$(ssh "$CONTROL_PLANE_SERVER_ADDRESS" "tailscale ip -4")
echo "✅ [connect-all-workers] TAILNET_ADDRESS=[${TAILNET_ADDRESS}]"

CONTROL_PLANE_SERVER_URL="https://$TAILNET_ADDRESS:$CONTROL_PLANE_SERVER_PORT"

echo "👉 [connect-all-workers] Connecting to worker nodes"

PROXMOX_ADDR="${VPS_PROXMOX_USERNAME}@${VPS_PROXMOX_HOST}"
echo "👉 [connect-all-workers] Connecting to node=[$PROXMOX_ADDR] with vps=[${VPS_PROXMOX_LABEL}]"
"$ROOT_DIR/scripts/connect-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$PROXMOX_ADDR" "$VPS_PROXMOX_LABEL"
echo "✅ [connect-all-workers] Connected to node=[$PROXMOX_ADDR] with vps=[${VPS_PROXMOX_LABEL}]"

MEDIA_ADDR="${VPS_MEDIA_USERNAME}@${VPS_MEDIA_HOST}"
echo "👉 [connect-all-workers] Connecting to node=[$MEDIA_ADDR] with vps=[${VPS_MEDIA_LABEL}]"
"$ROOT_DIR/scripts/connect-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$MEDIA_ADDR" "$VPS_MEDIA_LABEL"
echo "✅ [connect-all-workers] Connected to node=[$MEDIA_ADDR] with vps=[${VPS_MEDIA_LABEL}]"

FIRSTVDS_ADDR="${VPS_FIRSTVDS_USERNAME}@${VPS_FIRSTVDS_HOST}"
echo "👉 [connect-all-workers] Connecting to node=[$FIRSTVDS_ADDR] with vps=[${VPS_FIRSTVDS_LABEL}]"
"$ROOT_DIR/scripts/connect-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$FIRSTVDS_ADDR" "$VPS_FIRSTVDS_LABEL"
echo "✅ [connect-all-workers] Connected to node=[$FIRSTVDS_ADDR] with vps=[${VPS_FIRSTVDS_LABEL}]"

VULTR_ADDR="${VPS_VULTR_USERNAME}@${VPS_VULTR_HOST}"
echo "👉 [connect-all-workers] Connecting to node=[$VULTR_ADDR] with vps=[${VPS_VULTR_LABEL}]"
"$ROOT_DIR/scripts/connect-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$VULTR_ADDR" "$VPS_VULTR_LABEL"
echo "✅ [connect-all-workers] Connected to node=[$VULTR_ADDR] with vps=[${VPS_VULTR_LABEL}]"

NETCUP_ADDR="${VPS_NETCUP_USERNAME}@${VPS_NETCUP_HOST}"
echo "👉 [connect-all-workers] Connecting to node=[$NETCUP_ADDR] with vps=[${VPS_NETCUP_LABEL}]"
"$ROOT_DIR/scripts/connect-worker.sh" "$CONTROL_PLANE_SERVER_URL" "$NODE_TOKEN" "$NETCUP_ADDR" "$VPS_NETCUP_LABEL"
echo "✅ [connect-all-workers] Connected to node=[$NETCUP_ADDR] with vps=[${VPS_NETCUP_LABEL}]"

echo "✅ [connect-all-workers] Connected to worker nodes"
