#!/usr/bin/env bash
set -euo pipefail

# Upgrade helm chart in a given namespace.
# Usage: $0 <chart> <namespace_name> [--wait]
# The --wait flag makes helm wait until all resources are ready before returning.
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <chart> <namespace_name> [--wait]" >&2
  echo "Example: $0 senaev-com senaev-com" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../common/.env"; set +a

CHART="$1"
NS="$2"
shift 2

HELM_EXTRA_ARGS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wait)
      HELM_EXTRA_ARGS="$HELM_EXTRA_ARGS --wait --timeout 120s"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

HELM_PATH="$K3S_CLUSTER_PATH/provisioning/helm"
CHART_PATH="$HELM_PATH/$CHART"
COMMON_VALUES="$HELM_PATH/common-values.yaml"

LOG_PREFIX="[upgrade-namespace $CHART $NS]"

echo "👉 $LOG_PREFIX Checking namespace=[$NS]"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
echo "✅ $LOG_PREFIX Namespace=[$NS] exists"

if [[ -d "$CHART_PATH/crds" ]]; then
  for f in "$CHART_PATH"/crds/*.yml "$CHART_PATH"/crds/*.yaml; do
    [[ -e "$f" ]] || continue

    echo "👉 $LOG_PREFIX Applying CRD=[$f]"
    kubectl apply -f "$f" --server-side=true
    echo "✅ $LOG_PREFIX CRD=[$f] applied"
  done
fi

echo "👉 $LOG_PREFIX Helm upgrade chart=[$CHART] namespace=[$NS]"
helm upgrade --install "$CHART" "$CHART_PATH" \
-n "$NS" \
-f "$COMMON_VALUES" \
-f "$CHART_PATH/values.yaml" \
--take-ownership $HELM_EXTRA_ARGS
echo "✅ $LOG_PREFIX Helm upgrade chart=[$CHART] namespace=[$NS]"