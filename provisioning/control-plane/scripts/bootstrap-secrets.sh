#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

$SCRIPT_DIR/upgrade-namespace.sh external-secrets

echo "👉 [bootstrap-secrets] Waiting for ESO webhook to be ready (required for ClusterSecretStore validation by Vault)"
kubectl rollout status deployment/external-secrets-webhook -n external-secrets --timeout=120s
echo "✅ [bootstrap-secrets] ESO webhook ready"

$SCRIPT_DIR/upgrade-namespace.sh vault

echo "👉 [bootstrap-secrets] Deploying vault"
$SCRIPT_DIR/bootstrap-vault.sh
echo "✅ [bootstrap-secrets] Vault deployed"
