#!/bin/sh
set -e

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode-telegram-bot"
mkdir -p "$CONFIG_DIR"

# Write config file from env vars — the bot requires this file and won't fall back to process.env
cat > "$CONFIG_DIR/.env" << EOF
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is required}
TELEGRAM_ALLOWED_USER_ID=${TELEGRAM_ALLOWED_USER_ID:?TELEGRAM_ALLOWED_USER_ID is required}
OPENCODE_API_URL=${OPENCODE_API_URL:-http://localhost:4096}
OPENCODE_MODEL_PROVIDER=${OPENCODE_MODEL_PROVIDER:?OPENCODE_MODEL_PROVIDER is required}
OPENCODE_MODEL_ID=${OPENCODE_MODEL_ID:?OPENCODE_MODEL_ID is required}
OPEN_BROWSER_ROOTS=${OPEN_BROWSER_ROOTS:-/vault}
STT_API_URL=${STT_API_URL:-}
STT_API_KEY=${STT_API_KEY:-}
EOF

exec opencode-telegram start
