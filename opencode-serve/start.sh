#!/bin/bash
# Code Tools runs in a separate pod. exec forwards signals directly to OpenCode.
set -euo pipefail
: "${OPENCODE_WORKDIR:?OPENCODE_WORKDIR is required}"
cd "$OPENCODE_WORKDIR"
exec opencode serve --hostname 0.0.0.0
