#!/bin/bash
# Two processes: the prompt API for n8n and Claude Code Remote Control. When either exits, the
# script exits and Kubernetes restarts the container. On a stop, tini (-g) sends SIGTERM to the
# whole group and the script waits for both, because tini exits with this script and the rest is
# killed; Kubernetes bounds the wait (terminationGracePeriodSeconds). Remote Control stops its
# sessions and keeps them, so the next start brings them back.
set -euo pipefail
umask 077

: "${CLAUDE_CODE_MODEL:?CLAUDE_CODE_MODEL is required}"
: "${CLAUDE_CODE_AUTO_COMPACT_PERCENT:?CLAUDE_CODE_AUTO_COMPACT_PERCENT is required}"
workdir=/code

mkdir -p "$HOME/.claude"

# Remote Control refuses to start without a terminal until these two questions are answered.
# The MCP servers come from the Helm values and replace the user scope list on each start, so a
# server added by hand with `claude mcp add -s user` is removed. Their OAuth tokens stay in
# .credentials.json; the Telegram helper logs in with /claude_mcp.
config="$HOME/.claude.json"
[ -f "$config" ] || echo '{}' > "$config"
jq --arg dir "$workdir" --argjson servers "${WORKSPACE_MCP_SERVERS:-"{}"}" \
    '.remoteDialogSeen = true | .projects[$dir].hasTrustDialogAccepted = true | .mcpServers = $servers' \
    "$config" > "$config.tmp"
mv "$config.tmp" "$config"

# Starts before the login check, so that the readiness probe does not wait for a login: until
# then a prompt fails with the error of the CLI.
/app/claude-code/node_modules/.bin/tsx /app/claude-code/prompt-api/main.ts &
prompt_api_pid=$!
trap 'wait; exit 143' TERM INT

# Remote Control accepts only a full claude.ai login, so it cannot come from a secret.
# Log in once with: kubectl exec -it deploy/<name>-claude-code -- claude auth login
if ! claude auth status > /dev/null 2>&1; then
    echo "Claude Code is not logged in. Waiting for: claude auth login"
    until claude auth status > /dev/null 2>&1; do
        if ! kill -0 "$prompt_api_pid" 2> /dev/null; then
            echo "The prompt API exited."
            exit 1
        fi
        # In the background, so that the trap runs at once on a stop.
        sleep 30 &
        wait $! || true
    done
    echo "Claude Code is logged in."
fi

# Remote Control passes these settings to every session it spawns.
settings=/tmp/server-settings.json
jq -n --arg model "$CLAUDE_CODE_MODEL" --arg compact "$CLAUDE_CODE_AUTO_COMPACT_PERCENT" \
    '{model: $model, env: {CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: $compact}}' > "$settings"

cd "$workdir"
claude remote-control \
    --spawn same-dir \
    --permission-mode bypassPermissions \
    --settings "$settings" \
    < /dev/null &
remote_control_pid=$!

# `wait -n` misses a process that exited before it is called, so check both every few seconds.
while kill -0 "$prompt_api_pid" 2> /dev/null && kill -0 "$remote_control_pid" 2> /dev/null; do
    sleep 5 &
    wait $! || true
done
echo "The prompt API or Remote Control exited. Stopping the other one."
kill -TERM "$prompt_api_pid" "$remote_control_pid" 2> /dev/null || true
wait || true
exit 1
