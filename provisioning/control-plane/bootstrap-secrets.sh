#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAMESPACE_NAME=vault

$SCRIPT_DIR/upgrade-namespace.sh external-secrets "$NAMESPACE_NAME"

echo "👉 [bootstrap-secrets] Waiting for ESO webhook to be ready (required for ClusterSecretStore validation by Vault)"
kubectl rollout status deployment/external-secrets-webhook -n "$NAMESPACE_NAME" --timeout=120s
echo "✅ [bootstrap-secrets] ESO webhook ready"

$SCRIPT_DIR/upgrade-namespace.sh vault "$NAMESPACE_NAME"

echo "👉 [bootstrap-secrets] Deploying vault"
$SCRIPT_DIR/bootstrap-vault.sh
echo "✅ [bootstrap-secrets] Vault deployed"
