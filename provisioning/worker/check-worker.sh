#!/usr/bin/env bash
set -euo pipefail

echo "👉 [check-worker] Starting check"

# Exit 0 if all conditions are satisfied (worker is OK). Exit 1 if any condition fails (reinstall needed).
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <vps>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 yc" >&2
  exit 2
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"
VPS="$3"
EXPECTED_LABEL="vps=${VPS}"

LOG_PREFIX="[check-worker $VPS]"

if ! command -v k3s &>/dev/null; then
  echo "❌ $LOG_PREFIX k3s is not installed"
  exit 1
else
  echo "✅ $LOG_PREFIX k3s is installed"
fi

if [[ ! -f /etc/systemd/system/k3s-agent.service.env ]]; then
  echo "❌ $LOG_PREFIX k3s worker not configured (no k3s-agent.service.env)"
  exit 1
else
  echo "✅ $LOG_PREFIX k3s worker is configured (k3s-agent.service.env exists)"
fi

mapfile -t _k3s_env < <(sudo bash -c 'source /etc/systemd/system/k3s-agent.service.env && echo "$K3S_TOKEN" && echo "$K3S_URL"')
EXISTING_NODE_TOKEN="${_k3s_env[0]:-}"
EXISTING_SERVER_URL="${_k3s_env[1]:-}"

if ! systemctl is-active --quiet k3s-agent 2>/dev/null; then
  echo "❌ $LOG_PREFIX k3s-agent is not running"
  exit 1
else
  echo "✅ $LOG_PREFIX k3s-agent is running"
fi

if systemctl is-active --quiet k3s 2>/dev/null; then
  echo "❌ $LOG_PREFIX k3s is running in server mode, not worker"
  exit 1
else
  echo "✅ $LOG_PREFIX k3s is running in worker mode"
fi

if [[ "$CONTROL_PLANE_SERVER_URL" != "$EXISTING_SERVER_URL" ]]; then
  echo "❌ $LOG_PREFIX CONTROL_PLANE_SERVER_URL mismatch expected=[${CONTROL_PLANE_SERVER_URL}], existing=[${EXISTING_SERVER_URL}]"
  exit 1
else
  echo "✅ $LOG_PREFIX CONTROL_PLANE_SERVER_URL matches"
fi

if [[ "$NODE_TOKEN" != "$EXISTING_NODE_TOKEN" ]]; then
  echo "❌ $LOG_PREFIX NODE_TOKEN mismatch expected.length=[${#NODE_TOKEN}], existing.length=[${#EXISTING_NODE_TOKEN}]"
  exit 1
else
  echo "✅ $LOG_PREFIX NODE_TOKEN matches"
fi

EXISTING_LABEL=$(sudo grep -o "vps=[^'[:space:]]*" /etc/systemd/system/k3s-agent.service 2>/dev/null | head -n 1 || true)
if [[ "${EXPECTED_LABEL}" != "${EXISTING_LABEL}" ]]; then
  echo "❌ $LOG_PREFIX LABEL mismatch expected=[${EXPECTED_LABEL}], existing=[${EXISTING_LABEL}]"
  exit 1
else
  echo "✅ $LOG_PREFIX LABEL matches expected=[${EXPECTED_LABEL}] existing=[${EXISTING_LABEL}]"
fi

echo "✅ $LOG_PREFIX Worker is OK"
exit 0
