#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../../.env"; set +a

upgrade_namespace() {
  local NS="$1"
  local CHART_PATH="$PROVISIONING_PATH_REMOTE/control-plane/helm/$NS"

  echo "👉 [bootstrap-services] Checking namespace=[$NS]"
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
  echo "✅ [bootstrap-services] Namespace=[$NS] exists"

  echo "👉 [bootstrap-services] Helm upgrade namespace=[$NS]"
  helm upgrade --install "$NS" $CHART_PATH \
    -n "$NS" \
    -f $CHART_PATH/values.yaml \
    --take-ownership
  echo "✅ [bootstrap-services] Helm upgrade namespace=[$NS]"
}

upgrade_namespace $TRAEFIK_NS

upgrade_namespace $EXTERNAL_SECRETS_NS

echo "👉 [bootstrap-services] Waiting for ESO webhook to be ready (required for ClusterSecretStore validation by Vault)"
kubectl rollout status deployment/external-secrets-webhook -n "$EXTERNAL_SECRETS_NS" --timeout=120s
echo "✅ [bootstrap-services] ESO webhook ready"

upgrade_namespace $VAULT_NS

echo "👉 [bootstrap-services] Deploying vault"
$SCRIPT_DIR/bootstrap-vault.sh
echo "✅ [bootstrap-services] Vault deployed"

upgrade_namespace $VICTORIA_METRICS_OPERATOR_NS

echo "👉 [bootstrap-services] Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)"
kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n "$VICTORIA_METRICS_OPERATOR_NS" --timeout=120s
echo "✅ [bootstrap-services] Victoria Metrics Operator webhook ready"

upgrade_namespace $VICTORIA_METRICS_K8S_STACK_NS

upgrade_namespace $SENAEV_COM_NS
