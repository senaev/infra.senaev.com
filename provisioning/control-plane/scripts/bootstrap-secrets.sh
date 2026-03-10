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

# TODO: use same namespace for vm-operator and vm-stack
$SCRIPT_DIR/upgrade-namespace.sh vm-operator

echo "👉 [bootstrap-secrets] Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)"
kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n vm-operator --timeout=120s
echo "✅ [bootstrap-secrets] Victoria Metrics Operator webhook ready"
