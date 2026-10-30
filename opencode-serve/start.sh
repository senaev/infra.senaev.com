#!/bin/bash
# Code Tools runs in a separate pod. exec forwards signals directly to OpenCode.
set -euo pipefail
: "${OPENCODE_WORKDIR:?OPENCODE_WORKDIR is required}"
: "${OPENCODE_PASSWORD:?OPENCODE_PASSWORD is required}"
cd "$OPENCODE_WORKDIR"
exec opencode serve --hostname 0.0.0.0 --port 4096
