#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../../.env"; set +a

if ! command -v k3s &>/dev/null; then
  # Flannel VXLAN (UDP port 8472) doesn't work in Yandex Cloud, so use wireguard-native
  FLANNEL_BACKEND="wireguard-native"

  echo "👉 [bootstrap-control-plane] k3s not found, installing k3s=[${K3S_VERSION}]"
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="${K3S_VERSION}" \
    INSTALL_K3S_EXEC=" \
    server \
    --disable traefik \
    --flannel-backend=$FLANNEL_BACKEND \
    --write-kubeconfig-mode 644 \
    --node-label vps=hetzner \
    " \
    sh -
  echo "✅ [bootstrap-control-plane] k3s installed"
else
  echo "✅ [bootstrap-control-plane] k3s already installed"
fi

mkdir -p ~/.kube
if [ ! -e ~/.kube/config ]; then
  echo "👉 [bootstrap-control-plane] Making symlink to 'rancher' from a default 'kubectl' config (for 'k9s')"
  ln -sf /etc/rancher/k3s/k3s.yaml ~/.kube/config
  echo "✅ [bootstrap-control-plane] Symlink made"
else
  echo "✅ [bootstrap-control-plane] Symlink to 'rancher' already exists"
fi

upgrade_namespace() {
  local NS="$1"
  local CHART_PATH="$PROVISIONING_PATH_REMOTE/control-plane/helm/$NS"

  echo "👉 [bootstrap-control-plane] Checking namespace=[$NS]"
  kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
  echo "✅ [bootstrap-control-plane] Namespace=[$NS] exists"

  echo "👉 [bootstrap-control-plane] Helm upgrade namespace=[$NS]"
  helm upgrade --install "$NS" $CHART_PATH \
    -n "$NS" \
    -f $CHART_PATH/values.yaml \
    --take-ownership
  echo "✅ [bootstrap-control-plane] Helm upgrade namespace=[$NS]"
}

upgrade_namespace $TRAEFIK_NS

upgrade_namespace $EXTERNAL_SECRETS_NS

echo "👉 [bootstrap-control-plane] Waiting for ESO webhook to be ready (required for ClusterSecretStore validation by Vault)"
kubectl rollout status deployment/external-secrets-webhook -n "$EXTERNAL_SECRETS_NS" --timeout=120s
echo "✅ [bootstrap-control-plane] ESO webhook ready"

upgrade_namespace $VAULT_NS

echo "👉 [bootstrap-control-plane] Deploying vault"
$SCRIPT_DIR/bootstrap-vault.sh
echo "✅ [bootstrap-control-plane] Vault deployed"

upgrade_namespace $VICTORIA_METRICS_OPERATOR_NS

echo "👉 [bootstrap-control-plane] Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)"
kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n "$VICTORIA_METRICS_OPERATOR_NS" --timeout=120s
echo "✅ [bootstrap-control-plane] Victoria Metrics Operator webhook ready"

upgrade_namespace $VICTORIA_METRICS_K8S_STACK_NS

upgrade_namespace $SENAEV_COM_NS
