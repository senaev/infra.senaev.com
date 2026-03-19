#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TERRAFORM_DIR="$ROOT_DIR/terraform"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

echo "👉 [apply-terraform] Initializing Terraform"
cd "$TERRAFORM_DIR" && terraform init -input=false
echo "✅ [apply-terraform] Terraform initialized"

echo "👉 [apply-terraform] Applying Terraform configuration"
if ! terraform apply -auto-approve 2>&1; then
  echo "❌ [apply-terraform] Apply failed, attempting to import existing Hetzner resources"

  HCLOUD_TOKEN=$(grep 'hetzner_token' "$TERRAFORM_DIR/terraform.tfvars" | sed 's/.*"\(.*\)".*/\1/')
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
  ECDSA_ID=$(echo "$SSH_KEYS" | jq -r '.ssh_keys[] | select(.name=="senaev@yandex-team") | .id')
  echo "✅ [apply-terraform] ECDSA SSH key ID: $ECDSA_ID"
  ED25519_ID=$(echo "$SSH_KEYS" | jq -r '.ssh_keys[] | select(.name=="senaev@personal-mac") | .id')
  echo "✅ [apply-terraform] Ed25519 SSH key ID: $ED25519_ID"

  if [ -n "$ECDSA_ID" ]; then
    echo "👉 [apply-terraform] Importing ECDSA SSH key (ID: $ECDSA_ID)"
    terraform import hcloud_ssh_key.ecdsa "$ECDSA_ID" || true
    echo "✅ [apply-terraform] ECDSA SSH key imported"
  else
    echo "⚠️  [apply-terraform] ECDSA SSH key not found in Hetzner API — it will be recreated"
  fi

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
sed -i '' "s/^CONTROL_PLANE_SERVER_IP=.*/CONTROL_PLANE_SERVER_IP=$SERVER_IP/" "$ENV_FILE"
echo "✅ [apply-terraform] CONTROL_PLANE_SERVER_IP set to $SERVER_IP"

echo "👉 [apply-terraform] Updating known_hosts for $SERVER_IP"
ssh-keygen -R "$SERVER_IP" 2>/dev/null || true
echo "✅ [apply-terraform] known_hosts updated for $SERVER_IP"

echo "👉 [apply-terraform] Waiting for SSH to become available"
until ssh-keyscan -H "$SERVER_IP" >> ~/.ssh/known_hosts 2>/dev/null; do
  sleep 5
done
echo "✅ [apply-terraform] SSH is available for $SERVER_IP"

echo "👉 [apply-terraform] Waiting for cloud-init to finish (⚠️ might take a few minutes)"
ssh "root@$SERVER_IP" "cloud-init status --wait"
echo "✅ [apply-terraform] cloud-init finished"
