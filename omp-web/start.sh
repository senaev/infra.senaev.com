#!/bin/bash
set -euo pipefail
umask 077

# Seed app settings once; MCP definitions are managed by the shared chart config.
mkdir -p "$HOME/.omp/agent"
chmod 700 "$HOME/.omp" "$HOME/.omp/agent"
if [ ! -e "$HOME/.omp/agent/config.yml" ]; then
    install -m 600 /defaults/config.yml "$HOME/.omp/agent/config.yml"
fi

for file in mcp.json models.yml; do
    install -m 600 "/defaults/$file" "$HOME/.omp/agent/$file"
done

# Reapply managed settings to existing state as well as fresh installations.
# Keep other model roles and unrelated saved settings.
omp config set modelRoles "$(omp config get modelRoles --json | jq --arg model "$OMP_DEFAULT_MODEL" '.value + {default: $model}')" > /dev/null

# Auto-approve file reads/writes and arbitrary command execution.
omp config set tools.approvalMode yolo > /dev/null

exec ompweb
