#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# TODO: use same namespace for vm-operator and vm-stack
$SCRIPT_DIR/upgrade-namespace.sh vm-operator

echo "👉 [bootstrap-telemetry] Waiting for Victoria Metrics Operator webhook to be ready (required for vm-stack CRs)"
kubectl rollout status deployment/vm-operator-victoria-metrics-operator -n vm-operator --timeout=120s
echo "✅ [bootstrap-telemetry] Victoria Metrics Operator webhook ready"

# TODO: use same namespace for vm-operator and vm-stack
$SCRIPT_DIR/upgrade-namespace.sh vm-stack
