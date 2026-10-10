#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; source "$SCRIPT_DIR/../common/.env"; set +a

bash "$SCRIPT_DIR/../common/check-tailscale-dual-stack.sh"

# No node IPs are passed: with --flannel-iface, k3s reads the node IPs (and the API advertise
# address) from tailscale0 on every start, so a changed tailnet IP needs no reinstall.
# IPv4 is listed first in the CIDRs, so it stays the primary family: Services are IPv4-only
# unless they opt in with ipFamilyPolicy. See tasks/2026-10-04-k3s-dual-stack-ipv6.md
if ! command -v k3s &>/dev/null; then
  echo "👉 [bootstrap-control-plane] k3s not found, installing k3s=[${K3S_VERSION}]"
  curl -sfL https://get.k3s.io | \
    INSTALL_K3S_VERSION="${K3S_VERSION}" \
    INSTALL_K3S_EXEC=" \
    server \
    --disable traefik \
    --cluster-cidr=$K3S_CLUSTER_CIDR \
    --service-cidr=$K3S_SERVICE_CIDR \
    --flannel-iface=tailscale0 \
    --flannel-ipv6-masq \
    --write-kubeconfig-mode 644 \
    --node-label vps=hetzner \
    " \
    sh -
  echo "✅ [bootstrap-control-plane] k3s installed"
else
  echo "✅ [bootstrap-control-plane] k3s already installed"

  # The pod and Service CIDRs are fixed when the cluster is created, so a server installed
  # with other CIDRs (the old IPv4-only cluster) cannot be fixed by this script.
  if ! grep -qF -- "--cluster-cidr=${K3S_CLUSTER_CIDR}" /etc/systemd/system/k3s.service; then
    echo "❌ [bootstrap-control-plane] Installed k3s server is not configured with cluster-cidr=[${K3S_CLUSTER_CIDR}]"
    echo "❌ [bootstrap-control-plane] This needs a full cluster rebuild - see tasks/2026-10-04-k3s-dual-stack-ipv6.md"
    exit 1
  fi

  INSTALLED_K3S_VERSION="$(k3s --version | awk 'NR == 1 { print $3 }')"
  if [[ "$INSTALLED_K3S_VERSION" != "$K3S_VERSION" ]]; then
    echo "⚠️ [bootstrap-control-plane] Installed k3s=[${INSTALLED_K3S_VERSION}] differs from K3S_VERSION=[${K3S_VERSION}], upgrade it by hand"
  fi
fi

# Runs unconditionally, outside the install guard above: an already-installed k3s is
# exactly the case that needs this applied. See the script header for the failure mode.
echo "👉 [bootstrap-control-plane] Hardening node networking (k3s <-> tailscale0 binding)"
bash "$SCRIPT_DIR/../common/bootstrap-node-networking.sh" k3s
echo "✅ [bootstrap-control-plane] Node networking hardened"

mkdir -p ~/.kube
if [ ! -e ~/.kube/config ]; then
  echo "👉 [bootstrap-control-plane] Making symlink to 'rancher' from a default 'kubectl' config (for 'k9s')"
  ln -sf /etc/rancher/k3s/k3s.yaml ~/.kube/config
  echo "✅ [bootstrap-control-plane] Symlink made"
else
  echo "✅ [bootstrap-control-plane] Symlink to 'rancher' already exists"
fi
