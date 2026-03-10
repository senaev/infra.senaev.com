#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../../.env"; set +a

$SCRIPT_DIR/upgrade-namespace.sh $TRAEFIK_NS

$SCRIPT_DIR/upgrade-namespace.sh $EXTERNAL_SECRETS_NS

echo "👉 [bootstrap-services] Waiting for ESO webhook to be ready (required for ClusterSecretStore validation by Vault)"
kubectl rollout status deployment/external-secrets-webhook -n "$EXTERNAL_SECRETS_NS" --timeout=120s
echo "✅ [bootstrap-services] ESO webhook ready"

$SCRIPT_DIR/upgrade-namespace.sh $VAULT_NS

echo "👉 [bootstrap-services] Deploying vault"
$SCRIPT_DIR/bootstrap-vault.sh
echo "✅ [bootstrap-services] Vault deployed"

$SCRIPT_DIR/upgrade-namespace.sh $VICTORIA_METRICS_OPERATOR_NS

echo "👉 [bootstrap-services] Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)"
kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n "$VICTORIA_METRICS_OPERATOR_NS" --timeout=120s
echo "✅ [bootstrap-services] Victoria Metrics Operator webhook ready"

$SCRIPT_DIR/upgrade-namespace.sh $VICTORIA_METRICS_K8S_STACK_NS

$SCRIPT_DIR/upgrade-namespace.sh $SENAEV_COM_NS
