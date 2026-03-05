#!/usr/bin/env bash
set -euo pipefail

echo "👉 [check-worker] Starting check"

# Exit 0 if all conditions are satisfied (worker is OK). Exit 1 if any condition fails (reinstall needed).
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <labels>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 label1=value1,label2=value2" >&2
  exit 2
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"
EXPECTED_LABELS="$3"

if ! command -v k3s &>/dev/null; then
  echo "❌ [check-worker] k3s is not installed"
  exit 1
else
  echo "✅ [check-worker] k3s is installed"
fi

if [[ ! -f /etc/systemd/system/k3s-agent.service.env ]]; then
  echo "❌ [check-worker] k3s worker not configured (no k3s-agent.service.env)"
  exit 1
else
  echo "✅ [check-worker] k3s worker is configured (k3s-agent.service.env exists)"
fi

mapfile -t _k3s_env < <(sudo bash -c 'source /etc/systemd/system/k3s-agent.service.env && echo "$K3S_TOKEN" && echo "$K3S_URL"')
EXISTING_NODE_TOKEN="${_k3s_env[0]:-}"
EXISTING_SERVER_URL="${_k3s_env[1]:-}"

if ! systemctl is-active --quiet k3s-agent 2>/dev/null; then
  echo "❌ [check-worker] k3s-agent is not running"
  exit 1
else
  echo "✅ [check-worker] k3s-agent is running"
fi

if systemctl is-active --quiet k3s 2>/dev/null; then
  echo "❌ [check-worker] k3s is running in server mode, not worker"
  exit 1
else
  echo "✅ [check-worker] k3s is running in worker mode"
fi

if [[ "$CONTROL_PLANE_SERVER_URL" != "$EXISTING_SERVER_URL" ]]; then
  echo "❌ [check-worker] CONTROL_PLANE_SERVER_URL mismatch expected=[${CONTROL_PLANE_SERVER_URL}], existing=[${EXISTING_SERVER_URL}]"
  exit 1
else
  echo "✅ [check-worker] CONTROL_PLANE_SERVER_URL matches"
fi

if [[ "$NODE_TOKEN" != "$EXISTING_NODE_TOKEN" ]]; then
  echo "❌ [check-worker] NODE_TOKEN mismatch expected=[${NODE_TOKEN:0:4}...${NODE_TOKEN: -4}], existing=[${EXISTING_NODE_TOKEN:0:4}...${EXISTING_NODE_TOKEN: -4}]"
  exit 1
else
  echo "✅ [check-worker] NODE_TOKEN matches"
fi

EXISTING_LABELS=$(sudo sed -n "/'--node-label'/{n;p}" /etc/systemd/system/k3s-agent.service 2>/dev/null | sed "s/'//g" | paste -sd ',' -)
normalize_labels() {
  tr ',' '\n' <<< "${1:-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/\\$//' -e 's/[[:space:]]*$//' | grep -v '^$' | sort -u | paste -sd ',' -
}

EXISTING_LABELS_NORMALIZED=$(normalize_labels "$EXISTING_LABELS")
EXPECTED_LABELS_NORMALIZED=$(normalize_labels "$EXPECTED_LABELS")
if [[ "${EXPECTED_LABELS_NORMALIZED}" != "${EXISTING_LABELS_NORMALIZED}" ]]; then
  echo "❌ [check-worker] LABELS mismatch expected=[${EXPECTED_LABELS_NORMALIZED}], existing=[${EXISTING_LABELS_NORMALIZED}]"
  exit 1
else
  echo "✅ [check-worker] LABELS match expected=[${EXPECTED_LABELS_NORMALIZED}] existing=[${EXISTING_LABELS_NORMALIZED}]"
fi

echo "✅ [check-worker] Worker is OK"
exit 0
