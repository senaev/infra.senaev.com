#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NAMESPACE_NAME=vault
TOKEN_SENAEV_COM_BOT="${1:?bootstrap-secrets.sh requires TG_TOKEN_SENAEV_COM_BOT as the first argument}"

$SCRIPT_DIR/upgrade-namespace.sh external-secrets "$NAMESPACE_NAME"

# The rollout check alone is not enough: after an upgrade, cert-controller re-injects the
# webhook caBundle and the pod reloads its cert asynchronously, so validation can fail with x509 errors.
echo "👉 [bootstrap-secrets] Waiting for ESO webhook to accept requests (required for ClusterSecretStore validation by Vault)"
kubectl rollout status deployment/external-secrets-webhook -n "$NAMESPACE_NAME" --timeout=120s
for attempt in $(seq 1 30); do
  if kubectl apply --dry-run=server -f - >/dev/null 2>&1 <<'EOF'
apiVersion: external-secrets.io/v1
kind: ClusterSecretStore
metadata:
  name: eso-webhook-readiness-probe
spec:
  provider:
    fake:
      data: []
EOF
  then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    echo "❌ [bootstrap-secrets] ESO webhook does not accept requests after 150s"
    exit 1
  fi
  sleep 5
done
echo "✅ [bootstrap-secrets] ESO webhook ready"

$SCRIPT_DIR/upgrade-namespace.sh vault "$NAMESPACE_NAME"

echo "👉 [bootstrap-secrets] Deploying vault"
$SCRIPT_DIR/bootstrap-vault.sh "$TOKEN_SENAEV_COM_BOT"
echo "✅ [bootstrap-secrets] Vault deployed"
