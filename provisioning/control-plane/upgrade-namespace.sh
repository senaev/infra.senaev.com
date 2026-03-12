#!/usr/bin/env bash
set -euo pipefail

# Upgrade namespace with helm chart.
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <namespace>" >&2
  echo "Example: $0 senaev-com" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../common/.env"; set +a

NS="$1"
CHART_PATH="$K3S_CLUSTER_PATH/provisioning/helm/$NS"

echo "👉 [upgrade-namespace] Checking namespace=[$NS]"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
echo "✅ [upgrade-namespace] Namespace=[$NS] exists"

if [[ -d "$CHART_PATH/crds" ]]; then
  echo "👉 [upgrade-namespace] Installing CRDs from $CHART_PATH/crds"
  for f in "$CHART_PATH"/crds/*.yml "$CHART_PATH"/crds/*.yaml; do
    [[ -e "$f" ]] || continue
    kubectl apply -f "$f" --server-side=true 2>/dev/null || kubectl apply -f "$f"
  done
  echo "✅ [upgrade-namespace] CRDs applied"
fi

echo "👉 [upgrade-namespace] Helm upgrade namespace=[$NS]"
helm upgrade --install "$NS" $CHART_PATH \
-n "$NS" \
-f $CHART_PATH/values.yaml \
--take-ownership
echo "✅ [upgrade-namespace] Helm upgrade namespace=[$NS]"