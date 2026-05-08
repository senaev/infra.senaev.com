#!/usr/bin/env bash
set -euo pipefail

# Syncs provisioning files to server.
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <address>" >&2
  echo "Example: $0 root@11.111.111.111" >&2
  exit 1
fi

ADDRESS="$1"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a; source "$ROOT_DIR/.env"; set +a

PROVISIONING_PATH="$K3S_CLUSTER_PATH/provisioning"
REMOTE_DEST="$ADDRESS:$PROVISIONING_PATH/"

SSH_CONFIG="$(ssh -G "$ADDRESS")"
SSH_HOST="$(printf '%s\n' "$SSH_CONFIG" | awk '$1 == "hostname" { print $2; exit }')"
SSH_PORT="$(printf '%s\n' "$SSH_CONFIG" | awk '$1 == "port" { print $2; exit }')"
KNOWN_HOSTS_TARGET="$SSH_HOST"
SSH_KEYSCAN_OPTS=(-H -T 10)
SSH_OPTS=(-o StrictHostKeyChecking=yes)

if [[ "$SSH_PORT" != "22" ]]; then
  KNOWN_HOSTS_TARGET="[$SSH_HOST]:$SSH_PORT"
  SSH_KEYSCAN_OPTS+=(-p "$SSH_PORT")
fi

mkdir -p ~/.ssh
touch ~/.ssh/known_hosts

echo "👉 [rsync-provisioning] Updating known_hosts for [$KNOWN_HOSTS_TARGET]"
if ! SSH_HOST_KEY="$(ssh-keyscan "${SSH_KEYSCAN_OPTS[@]}" "$SSH_HOST" 2>/dev/null)" || [[ -z "$SSH_HOST_KEY" ]]; then
  echo "❌ [rsync-provisioning] Could not scan SSH host key for [$KNOWN_HOSTS_TARGET]" >&2
  echo "ℹ️  [rsync-provisioning] Try: ssh $ADDRESS" >&2
  exit 1
fi
ssh-keygen -R "$KNOWN_HOSTS_TARGET" 2>/dev/null || true
printf '%s\n' "$SSH_HOST_KEY" >> ~/.ssh/known_hosts
echo "✅ [rsync-provisioning] known_hosts updated for [$KNOWN_HOSTS_TARGET]"

echo "👉 [rsync-provisioning] Creating k3s cluster path on [$REMOTE_DEST]"
ssh "${SSH_OPTS[@]}" "$ADDRESS" "sudo mkdir -p $K3S_CLUSTER_PATH && sudo chown -R \$USER:\$USER $K3S_CLUSTER_PATH"
echo "✅ [rsync-provisioning] k3s cluster path created on [$REMOTE_DEST]"

echo "👉 [rsync-provisioning] Creating provisioning directory on [$REMOTE_DEST]"
ssh "${SSH_OPTS[@]}" "$ADDRESS" "mkdir -p $PROVISIONING_PATH"
echo "✅ [rsync-provisioning] Provisioning directory created on [$REMOTE_DEST]"

echo "👉 [rsync-provisioning] Rsyncing provisioning files to [$REMOTE_DEST]"
rsync -avz --delete -e "ssh ${SSH_OPTS[*]}" "$ROOT_DIR/provisioning/" "$REMOTE_DEST"
echo "✅ [rsync-provisioning] Provisioning files rsynced to [$REMOTE_DEST]"
