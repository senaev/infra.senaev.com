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
terraform apply -auto-approve
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

echo "👉 [apply-terraform] Waiting for cloud-init to finish"
ssh "root@$SERVER_IP" "cloud-init status --wait"
echo "✅ [apply-terraform] cloud-init finished"
