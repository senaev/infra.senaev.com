#!/usr/bin/env bash
set -euo pipefail

# Usage: connect-worker-node.sh <node_token> <address> <labels>
# Connects to the worker at address and runs echo with the given parameters on the remote.

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <node_token> <address> <labels>" >&2
  exit 1
fi

NODE_TOKEN="$1"
ADDRESS="$2"
LABELS="$3"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

echo "👉 Connecting to node=[$ADDRESS] with labels=[${LABELS}]"
ssh "$ADDRESS" "echo NODE_TOKEN=\"$NODE_TOKEN\" ADDRESS=\"$ADDRESS\" LABELS=\"$LABELS\""
echo "✅ Connected to node=[$ADDRESS] with labels=[${LABELS}]"
