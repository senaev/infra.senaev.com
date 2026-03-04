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

# Extract host from URL (e.g. https://10.0.0.11:6443 -> 10.0.0.11)
if [[ "$ADDRESS" =~ ^https?://([^:/]+) ]]; then
  HOST="${BASH_REMATCH[1]}"
else
  HOST="$ADDRESS"
fi

SSH_TARGET="${REMOTE_USERNAME}@${HOST}"
ssh "$SSH_TARGET" "echo NODE_TOKEN=\"$NODE_TOKEN\" ADDRESS=\"$ADDRESS\" LABELS=\"$LABELS\""
