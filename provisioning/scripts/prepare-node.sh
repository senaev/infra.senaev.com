#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq &>/dev/null; then
  echo "👉 [bootstrap-vault] Installing jq"
  sudo apt-get update && sudo apt-get install -y jq
  echo "✅ [bootstrap-vault] jq installed"
fi
