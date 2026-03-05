#!/usr/bin/env bash
set -euo pipefail

# Connects to the worker at address and runs echo with the given parameters on the remote.
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <control_plane_server_url> <node_token> <labels>" >&2
  echo "Example: $0 https://11.111.111.111:6443 K106...7b53 label1=value1,label2=value2" >&2
  exit 1
fi

CONTROL_PLANE_SERVER_URL="$1"
NODE_TOKEN="$2"
LABELS="$3"

echo "👉 [bootstrap-worker] Bootstraping worker with labels=[${LABELS}]"

mapfile -t _k3s_env < <(sudo bash -c 'source /etc/systemd/system/k3s-agent.service.env && echo "$K3S_TOKEN" && echo "$K3S_URL"')
EXISTING_TOKEN="${_k3s_env[0]}"
EXISTING_SERVER="${_k3s_env[1]}"

# sudo curl -sfL https://get.k3s.io | K3S_URL="https://46.225.174.102:6443" K3S_TOKEN="K106ee9db4e0273d8811e91711470a74f74acddc3c49c7b74aa4600e95f9fd83a63::server:667cdaa00b52462d15e276f455aac14b"  sh -

echo "👉 [bootstrap-worker] CONTROL_PLANE_SERVER_URL=[${CONTROL_PLANE_SERVER_URL}]"
echo "👉 [bootstrap-worker] NODE_TOKEN=[${NODE_TOKEN}]"
echo "👉 [bootstrap-worker] EXISTING_TOKEN=[${EXISTING_TOKEN}]"
echo "👉 [bootstrap-worker] EXISTING_SERVER=[${EXISTING_SERVER}]"

echo "✅ [bootstrap-worker] Bootstrapped worker with labels=[${LABELS}]"
