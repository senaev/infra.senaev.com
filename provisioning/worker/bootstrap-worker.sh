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

# 

echo "✅ [bootstrap-worker] Bootstrapped worker with labels=[${LABELS}]"
