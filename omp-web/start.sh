#!/bin/bash
set -euo pipefail
umask 077

# Seed once; browser edits, credentials and plugins belong to the persistent home.
mkdir -p "$HOME/.omp/agent"
chmod 700 "$HOME/.omp" "$HOME/.omp/agent"
for source in /defaults/config.yml /defaults/mcp.json; do
    destination="$HOME/.omp/agent/$(basename "$source")"
    if [ ! -e "$destination" ]; then
        install -m 600 "$source" "$destination"
    fi
done

exec ompweb
