#!/bin/sh
set -e

if [ -z "$OBSIDIAN_AUTH_TOKEN" ]; then
  echo "[obsidian-sync] ERROR: OBSIDIAN_AUTH_TOKEN is not set" >&2
  exit 1
fi
if [ -z "$OBSIDIAN_VAULT_NAME" ]; then
  echo "[obsidian-sync] ERROR: OBSIDIAN_VAULT_NAME is not set" >&2
  exit 1
fi
if [ -z "$OBSIDIAN_VAULT_PATH" ]; then
  echo "[obsidian-sync] ERROR: OBSIDIAN_VAULT_PATH is not set" >&2
  exit 1
fi

echo "[obsidian-sync] Logging in..."
ob login

echo "[obsidian-sync] Setting up vault '$OBSIDIAN_VAULT_NAME' at $OBSIDIAN_VAULT_PATH..."
ob sync-setup --vault "$OBSIDIAN_VAULT_NAME" --path "$OBSIDIAN_VAULT_PATH"

ob sync-config --path "$OBSIDIAN_VAULT_PATH" --device-name "senaev-com-obsidian-headless"
ob sync-config --path "$OBSIDIAN_VAULT_PATH" --mode "bidirectional"
ob sync-config --path "$OBSIDIAN_VAULT_PATH" --conflict-strategy "merge"
ob sync-config --path "$OBSIDIAN_VAULT_PATH" --excluded-folders "senaev-personal-tools/node_modules"
ob sync-config --path "$OBSIDIAN_VAULT_PATH" --configs "app,appearance,appearance-data,hotkey,core-plugin,core-plugin-data,community-plugin,community-plugin-data"
ob sync-config --path "$OBSIDIAN_VAULT_PATH" --file-types "image,audio,video,pdf,unsupported"

echo "[obsidian-sync] Starting continuous sync..."
exec ob sync --path "$OBSIDIAN_VAULT_PATH" --continuous
