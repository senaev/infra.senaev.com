#!/usr/bin/env bash
set -euo pipefail

# k3s takes the node IPs from tailscale0 (--flannel-iface), and a dual-stack node fails to
# start without both families, so this is checked before k3s is installed.

LOG_PREFIX="[check-tailscale-dual-stack]"
TAILSCALE_IFACE="tailscale0"

TAILNET_IP4="$(ip -4 -o addr show dev "$TAILSCALE_IFACE" 2>/dev/null | awk '{ print $4 }')"
TAILNET_IP6="$(ip -6 -o addr show dev "$TAILSCALE_IFACE" scope global 2>/dev/null | awk '{ print $4 }')"

if [[ -z "$TAILNET_IP4" || -z "$TAILNET_IP6" ]]; then
  echo "❌ $LOG_PREFIX ${TAILSCALE_IFACE} must have IPv4 and global IPv6, got IPv4=[${TAILNET_IP4}] IPv6=[${TAILNET_IP6}]"
  echo "❌ $LOG_PREFIX Is tailscale up? Run: tailscale status"
  exit 1
fi

echo "✅ $LOG_PREFIX ${TAILSCALE_IFACE} IPv4=[${TAILNET_IP4}] IPv6=[${TAILNET_IP6}]"
