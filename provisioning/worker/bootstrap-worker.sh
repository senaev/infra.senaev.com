#!/usr/bin/env bash
set -euo pipefail

# Connects to the worker at address and runs echo with the given parameters on the remote.
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <node_token> <labels>" >&2
  echo "Example: $0 K106...7b53 label1=value1,label2=value2" >&2
  exit 1
fi

NODE_TOKEN="$1"
LABELS="$2"

echo "👉 [bootstrap-worker] Bootstraping worker with labels=[${LABELS}]"

EXISTING_TOKEN=$(sudo bash -c 'source /etc/systemd/system/k3s-agent.service.env && echo $K3S_TOKEN')
EXISTING_SERVER=$(sudo bash -c 'source /etc/systemd/system/k3s-agent.service.env && echo $K3S_URL')

# sudo curl -sfL https://get.k3s.io | K3S_URL="https://46.225.174.102:6443" K3S_TOKEN="K106ee9db4e0273d8811e91711470a74f74acddc3c49c7b74aa4600e95f9fd83a63::server:667cdaa00b52462d15e276f455aac14b"  sh -

echo "👉 [bootstrap-worker] EXISTING_TOKEN=[${EXISTING_TOKEN}]"
echo "👉 [bootstrap-worker] EXISTING_SERVER=[${EXISTING_SERVER}]"

echo "✅ [bootstrap-worker] Bootstrapped worker with labels=[${LABELS}]"
