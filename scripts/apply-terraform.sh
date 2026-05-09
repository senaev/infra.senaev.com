#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
SSH_OPTS=(-o ConnectTimeout=5 -o StrictHostKeyChecking=ask)

get_tfvar() {
  local key="$1"

  awk -F '=' -v key="$key" '
    $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
      value = $2
      sub(/^[[:space:]]*"/, "", value)
      sub(/"[[:space:]]*$/, "", value)
      print value
      exit
    }
  ' "$TERRAFORM_DIR/terraform.tfvars"
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  tmp_file="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

sync_tfvar_to_env() {
  local key="$1"
  local value

  value="$(get_tfvar "$key")"
  if [[ -z "$value" ]]; then
    echo "❌ [apply-terraform] Missing required value for [$key] in terraform.tfvars" >&2
    exit 1
  fi
  upsert_env_var "$ENV_FILE" "$key" "$value"
}

echo "👉 [apply-terraform] Initializing Terraform"
cd "$TERRAFORM_DIR" && terraform init -input=false
echo "✅ [apply-terraform] Terraform initialized"

echo "👉 [apply-terraform] Applying Terraform configuration"
if ! terraform apply -auto-approve 2>&1; then
  echo "❌ [apply-terraform] Apply failed, attempting to import existing Hetzner resources"

  HCLOUD_TOKEN=$(grep 'HETZNER_TOKEN' "$TERRAFORM_DIR/terraform.tfvars" | sed 's/.*"\(.*\)".*/\1/')
  API="https://api.hetzner.cloud/v1"
  AUTH="Authorization: Bearer $HCLOUD_TOKEN"

  # Import server by name
  echo "👉 [apply-terraform] Requesting server ID"
  SERVER_ID=$(curl -s -H "$AUTH" "$API/servers" | jq -r '.servers[] | select(.name=="hetzner") | .id')
  echo "✅ [apply-terraform] Server ID: $SERVER_ID"

  if [ -n "$SERVER_ID" ]; then
    echo "👉 [apply-terraform] Importing server (ID: $SERVER_ID)"
    terraform import hcloud_server.control_plane "$SERVER_ID" || true
    echo "✅ [apply-terraform] Server imported"
  else
    echo "⚠️  [apply-terraform] Server not found in Hetzner API — it will be recreated"
  fi

  # Import SSH keys by name
  echo "👉 [apply-terraform] Requesting SSH key IDs"
  SSH_KEYS=$(curl -s -H "$AUTH" "$API/ssh_keys")
  echo "✅ [apply-terraform] SSH keys retrieved from Hetzner API"

  ED25519_ID=$(echo "$SSH_KEYS" | jq -r '.ssh_keys[] | select(.name=="senaev@personal-mac") | .id')
  if [ -n "$ED25519_ID" ]; then
    echo "👉 [apply-terraform] Importing Ed25519 SSH key (ID: $ED25519_ID)"
    terraform import hcloud_ssh_key.ed25519 "$ED25519_ID" || true
    echo "✅ [apply-terraform] Ed25519 SSH key imported"
  else
    echo "⚠️  [apply-terraform] Ed25519 SSH key not found in Hetzner API — it will be recreated"
  fi

  echo "👉 [apply-terraform] Retrying apply after import"
  terraform apply -auto-approve
fi
echo "✅ [apply-terraform] Terraform configuration applied"

if [ ! -f "$ENV_FILE" ]; then
  echo "👉 [apply-terraform] Creating .env from .env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "✅ [apply-terraform] .env created"
fi

echo "👉 [apply-terraform] Applying server IP from Terraform output"
SERVER_IP=$(terraform output -raw server_ip)
upsert_env_var "$ENV_FILE" "CONTROL_PLANE_SERVER_IP" "$SERVER_IP"
echo "✅ [apply-terraform] CONTROL_PLANE_SERVER_IP set to $SERVER_IP"

echo "👉 [apply-terraform] Applying values from terraform.tfvars to .env"
for key in \
  TG_TOKEN_SENAEV_COM_BOT \
  VPS_PROXMOX_HOST \
  VPS_PROXMOX_USERNAME \
  VPS_PROXMOX_LABEL \
  VPS_MEDIA_HOST \
  VPS_MEDIA_USERNAME \
  VPS_MEDIA_LABEL \
  VPS_FIRSTVDS_HOST \
  VPS_FIRSTVDS_USERNAME \
  VPS_FIRSTVDS_LABEL \
  VPS_VULTR_HOST \
  VPS_VULTR_USERNAME \
  VPS_VULTR_LABEL \
  VPS_NETCUP_HOST \
  VPS_NETCUP_USERNAME \
  VPS_NETCUP_LABEL
do
  sync_tfvar_to_env "$key"
done
echo "✅ [apply-terraform] terraform.tfvars values written to .env"

echo "👉 [apply-terraform] Waiting for cloud-init to finish (⚠️ might take a few minutes on first boot)"
CONSECUTIVE_QUERY_FAILURES=0
MAX_CONSECUTIVE_QUERY_FAILURES=6
while true; do
  CLOUD_INIT_STATUS="$(ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "cloud-init status --format=json || true" 2>/dev/null)" || {
    CONSECUTIVE_QUERY_FAILURES=$((CONSECUTIVE_QUERY_FAILURES + 1))
    echo "⚠️  [apply-terraform] Failed to query cloud-init status (attempt $CONSECUTIVE_QUERY_FAILURES/$MAX_CONSECUTIVE_QUERY_FAILURES), retrying in 5s"

    if [ "$CONSECUTIVE_QUERY_FAILURES" -ge "$MAX_CONSECUTIVE_QUERY_FAILURES" ]; then
      echo "❌ [apply-terraform] Could not reconnect to the server to read cloud-init status"
      echo "ℹ️  [apply-terraform] Try: ssh root@$SERVER_IP"
      exit 1
    fi

    sleep 5
    continue
  }
  CONSECUTIVE_QUERY_FAILURES=0

  if [ -z "$CLOUD_INIT_STATUS" ]; then
    echo "⚠️  [apply-terraform] cloud-init returned empty status payload, retrying in 5s"
    sleep 5
    continue
  fi

  STATUS="$(echo "$CLOUD_INIT_STATUS" | jq -r '.status')"
  EXTENDED_STATUS="$(echo "$CLOUD_INIT_STATUS" | jq -r '.extended_status // ""')"

  echo "⏳ [apply-terraform] cloud-init status=[$STATUS] extended_status=[$EXTENDED_STATUS]"

  if [ "$STATUS" = "done" ]; then
    break
  fi

  if [ "$STATUS" = "error" ]; then
    echo "❌ [apply-terraform] cloud-init failed, collecting diagnostics"
    ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "cloud-init status --long || true"
    ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "echo; echo '--- /var/log/cloud-init-output.log ---'; tail -n 200 /var/log/cloud-init-output.log || true"
    ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" "echo; echo '--- /var/log/cloud-init.log ---'; tail -n 200 /var/log/cloud-init.log || true"
    exit 1
  fi

  sleep 5
done
echo "✅ [apply-terraform] cloud-init finished"
