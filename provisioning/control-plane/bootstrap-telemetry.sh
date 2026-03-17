#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAMESPACE_NAME=telemetry

$SCRIPT_DIR/upgrade-namespace.sh vm-operator "$NAMESPACE_NAME"

echo "👉 [bootstrap-telemetry] Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)"
kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n "$NAMESPACE_NAME" --timeout=120s
echo "✅ [bootstrap-telemetry] Victoria Metrics Operator webhook ready"

$SCRIPT_DIR/upgrade-namespace.sh vm-stack "$NAMESPACE_NAME"
