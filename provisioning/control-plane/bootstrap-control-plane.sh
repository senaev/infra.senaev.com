#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../common/.env"; set +a

echo "👉 [bootstrap-control-plane] Preparing node"
$SCRIPT_DIR/../common/prepare-node.sh
echo "✅ [bootstrap-control-plane] Node prepared"

# TODO: remove duplications
echo "👉 [bootstrap-control-plane] getting internal tailnet IP"
TAILNET_IP=$(tailscale ip -4)
echo "✅ [bootstrap-control-plane] TAILNET_IP=[${TAILNET_IP}]"

if ! command -v k3s &>/dev/null; then
  echo "👉 [bootstrap-control-plane] k3s not found, installing k3s=[${K3S_VERSION}]"
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="${K3S_VERSION}" \
    INSTALL_K3S_EXEC=" \
    server \
    --disable traefik \
    --node-ip=$TAILNET_IP \
    --advertise-address=$TAILNET_IP \
    --flannel-iface=tailscale0 \
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
