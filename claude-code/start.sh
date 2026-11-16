#!/bin/bash
# exec forwards signals directly to Claude Code. It stops its sessions and keeps them, so the
# next start brings them back.
set -euo pipefail
umask 077

: "${CLAUDE_CODE_MODEL:?CLAUDE_CODE_MODEL is required}"
workdir=/code

mkdir -p "$HOME/.claude"

# Remote Control refuses to start without a terminal until these two questions are answered.
# The MCP servers come from the Helm values and replace the user scope list on each start, so a
# server added by hand with `claude mcp add -s user` is removed. Their OAuth tokens stay in
# .credentials.json; the Telegram helper logs in with /mcp.
config="$HOME/.claude.json"
[ -f "$config" ] || echo '{}' > "$config"
jq --arg dir "$workdir" --argjson servers "${WORKSPACE_MCP_SERVERS:-"{}"}" \
    '.remoteDialogSeen = true | .projects[$dir].hasTrustDialogAccepted = true | .mcpServers = $servers' \
    "$config" > "$config.tmp"
mv "$config.tmp" "$config"

# Remote Control accepts only a full claude.ai login, so it cannot come from a secret.
# Log in once with: kubectl exec -it deploy/<name>-claude-code -- claude auth login
if ! claude auth status > /dev/null 2>&1; then
    echo "Claude Code is not logged in. Waiting for: claude auth login"
    until claude auth status > /dev/null 2>&1; do
        sleep 30
    done
    echo "Claude Code is logged in."
fi

settings=/tmp/server-settings.json
jq -n --arg model "$CLAUDE_CODE_MODEL" '{model: $model}' > "$settings"

cd "$workdir"
exec claude remote-control \
    --spawn same-dir \
    --permission-mode bypassPermissions \
    --settings "$settings" \
    < /dev/null
