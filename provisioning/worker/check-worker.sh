#!/usr/bin/env bash
set -euo pipefail

echo "👉 [check-worker] Starting check"

# Exit 0 if all conditions are satisfied (worker is OK). Exit 1 if any condition fails (reinstall needed).
if [[ $# -lt 2 ]]; then
  echo "❌ [check-worker] Invalid arguments (expected=[<control_plane_server_url> <node_token>])" >&2
  exit 2
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"

if ! command -v k3s &>/dev/null; then
  echo "❌ [check-worker] k3s is not installed"
  exit 1
fi

if [[ ! -f /etc/systemd/system/k3s-agent.service.env ]]; then
  echo "❌ [check-worker] k3s worker not configured (no k3s-agent.service.env)"
  exit 1
fi

mapfile -t _k3s_env < <(sudo bash -c 'source /etc/systemd/system/k3s-agent.service.env && echo "$K3S_TOKEN" && echo "$K3S_URL"')
EXISTING_NODE_TOKEN="${_k3s_env[0]:-}"
EXISTING_SERVER_URL="${_k3s_env[1]:-}"

if ! systemctl is-active --quiet k3s-agent 2>/dev/null; then
  echo "❌ [check-worker] k3s-agent is not running"
  exit 1
fi

if systemctl is-active --quiet k3s 2>/dev/null; then
  echo "❌ [check-worker] k3s is running in server mode, not worker"
  exit 1
fi

if [[ "$CONTROL_PLANE_SERVER_URL" != "$EXISTING_SERVER_URL" ]]; then
  echo "❌ [check-worker] CONTROL_PLANE_SERVER_URL mismatch (expected=[${EXISTING_SERVER_URL}])"
  exit 1
fi

if [[ "$NODE_TOKEN" != "$EXISTING_NODE_TOKEN" ]]; then
  echo "❌ [check-worker] NODE_TOKEN mismatch"
  exit 1
fi

echo "✅ [check-worker] Worker is OK"
exit 0
