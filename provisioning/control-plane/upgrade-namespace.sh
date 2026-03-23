#!/usr/bin/env bash
set -euo pipefail

# Upgrade helm chart in a given namespace.
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <chart> <namespace_name>" >&2
  echo "Example: $0 senaev-com senaev-com" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../common/.env"; set +a

CHART_NAME="$1"
NAMESPACE_NAME="$2"

CHART_PATH="$K3S_CLUSTER_PATH/provisioning/helm/$CHART_NAME"

echo "👉 [upgrade-namespace] Checking namespace=[$NAMESPACE_NAME]"
kubectl create namespace "$NAMESPACE_NAME" --dry-run=client -o yaml | kubectl apply -f -
echo "✅ [upgrade-namespace] Namespace=[$NAMESPACE_NAME] exists"

if [[ -d "$CHART_PATH/crds" ]]; then
  for f in "$CHART_PATH"/crds/*.yml "$CHART_PATH"/crds/*.yaml; do
    [[ -e "$f" ]] || continue

    echo "👉 [upgrade-namespace] Applying CRD=[$f]"
    kubectl apply -f "$f" --server-side=true
    echo "✅ [upgrade-namespace] CRD=[$f] applied"
  done
fi

echo "👉 [upgrade-namespace] Helm upgrade chart=[$CHART_NAME] namespace=[$NAMESPACE_NAME]"
helm upgrade --install "$CHART_NAME" "$CHART_PATH" \
-n "$NAMESPACE_NAME" \
-f "$K3S_CLUSTER_PATH/provisioning/helm/common-values.yaml" \
-f "$CHART_PATH/values.yaml" \
--take-ownership
echo "✅ [upgrade-namespace] Helm upgrade chart=[$CHART_NAME] namespace=[$NAMESPACE_NAME]"
