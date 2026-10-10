#!/bin/bash
# Runs opencode and the code-tools server side by side. When one of them exits, the script
# exits too, so Kubernetes restarts the container instead of leaving half of it running.
set -uo pipefail

: "${OPENCODE_WORKDIR:?OPENCODE_WORKDIR is required}"

children=()

stop_children() {
    kill -TERM "${children[@]}" 2>/dev/null
    wait
}

trap 'stop_children; exit 0' TERM INT

(cd "$OPENCODE_WORKDIR" && exec opencode serve --hostname 0.0.0.0) &
children+=($!)

# Without its token, code-tools refuses to start; opencode must keep working anyway.
if [ -n "${INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS:-}" ]; then
    (cd /app/code-tools && exec ./node_modules/.bin/tsx src/index.ts) &
    children+=($!)
else
    echo "⚠️ INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS is not set: code-tools is not started" >&2
fi

wait -n
exit_code=$?
echo "❌ A process exited with code ${exit_code}; stopping the container" >&2
stop_children
exit "$exit_code"
