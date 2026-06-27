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

[ -n "$OBSIDIAN_DEVICE_NAME" ]        && ob sync-config --path "$OBSIDIAN_VAULT_PATH" --device-name "$OBSIDIAN_DEVICE_NAME"
[ -n "$OBSIDIAN_SYNC_MODE" ]          && ob sync-config --path "$OBSIDIAN_VAULT_PATH" --mode "$OBSIDIAN_SYNC_MODE"
[ -n "$OBSIDIAN_CONFLICT_STRATEGY" ]  && ob sync-config --path "$OBSIDIAN_VAULT_PATH" --conflict-strategy "$OBSIDIAN_CONFLICT_STRATEGY"
[ -n "$OBSIDIAN_EXCLUDED_FOLDERS" ]   && ob sync-config --path "$OBSIDIAN_VAULT_PATH" --excluded-folders "$OBSIDIAN_EXCLUDED_FOLDERS"
[ -n "$OBSIDIAN_CONFIGS" ]            && ob sync-config --path "$OBSIDIAN_VAULT_PATH" --configs "$OBSIDIAN_CONFIGS"
[ -n "$OBSIDIAN_FILE_TYPES" ]         && ob sync-config --path "$OBSIDIAN_VAULT_PATH" --file-types "$OBSIDIAN_FILE_TYPES"

echo "[obsidian-sync] Starting continuous sync..."
exec ob sync --path "$OBSIDIAN_VAULT_PATH" --continuous
