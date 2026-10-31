#!/bin/bash
set -euo pipefail
umask 077

# Seed app settings once; MCP definitions are managed by the shared chart config.
mkdir -p "$HOME/.omp/agent"
chmod 700 "$HOME/.omp" "$HOME/.omp/agent"
if [ ! -e "$HOME/.omp/agent/config.yml" ]; then
    install -m 600 /defaults/config.yml "$HOME/.omp/agent/config.yml"
fi

install -m 600 /defaults/mcp.json "$HOME/.omp/agent/mcp.json"

exec ompweb
