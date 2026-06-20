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

echo "[obsidian-sync] Logging in..."
ob login

echo "[obsidian-sync] Setting up vault '$OBSIDIAN_VAULT_NAME' at /vault..."
ob sync-setup --vault "$OBSIDIAN_VAULT_NAME" --path /vault

[ -n "$OBSIDIAN_DEVICE_NAME" ]        && ob sync-config --path /vault --device-name "$OBSIDIAN_DEVICE_NAME"
[ -n "$OBSIDIAN_SYNC_MODE" ]          && ob sync-config --path /vault --mode "$OBSIDIAN_SYNC_MODE"
[ -n "$OBSIDIAN_CONFLICT_STRATEGY" ]  && ob sync-config --path /vault --conflict-strategy "$OBSIDIAN_CONFLICT_STRATEGY"
[ -n "$OBSIDIAN_EXCLUDED_FOLDERS" ]   && ob sync-config --path /vault --excluded-folders "$OBSIDIAN_EXCLUDED_FOLDERS"

echo "[obsidian-sync] Starting continuous sync..."
exec ob sync --path /vault --continuous
