#!/usr/bin/env bash
set -euo pipefail

# Makes the k3s <-> tailscale0 dependency explicit to systemd.
#
# WHY THIS EXISTS
#   k3s runs with --flannel-iface=tailscale0, so flannel creates flannel.1 as a VXLAN
#   device whose PARENT LINK is tailscale0. When tailscaled restarts (auto-update, package
#   upgrade, manual restart) the kernel deletes tailscale0 and, with it, every child device
#   - including flannel.1. The already-running k3s process never notices and never
#   recreates it, so ALL cross-node pod networking dies while the node still reports Ready.
#
#   This happened at 2026-08-09 06:16 UTC on hetzner, senaev-media and proxmox, and went
#   unnoticed for 6 days. Full analysis:
#   issues/2026-08-15-firstvds-https-hangs-no-web-traffic.md
#
# WHAT THIS INSTALLS
#   1. A systemd drop-in binding k3s to the tailscale0 .device unit, so k3s is stopped when
#      the interface disappears rather than left running with a dead overlay.
#   2. A udev rule that starts k3s again the moment tailscale0 returns. BindsTo stops a
#      unit but never restarts it, so this half is required for the pair to self-recover
#      without any timer or polling loop.
#   3. Tailscale auto-updates disabled, removing the most common trigger.
#   4. accept_ra=2 on the uplink interface, so SLAAC IPv6 keeps working with k3s forwarding.
#   5. Tailscale MTU 1350 (TS_DEBUG_MTU), so dual-stack pods keep an MTU >= 1280 (IPv6
#      minimum). See issues/2026-10-04-k3s-dual-stack-ipv6.md
#
# SAFETY
#   The drop-in is only installed when sys-subsystem-net-devices-tailscale0.device is
#   actually active. If that unit does not exist (some TUN devices are not udev-tagged for
#   systemd), BindsTo + After would make k3s permanently unstartable. In that case this
#   script removes any previously installed drop-in and exits non-zero instead.
#
# Idempotent: safe to run on every deployment.
#
# Usage: bootstrap-node-networking.sh [k3s|k3s-agent]
#        The unit is auto-detected when not given.

LOG_PREFIX="[bootstrap-node-networking]"

TAILSCALE_IFACE="tailscale0"
DEVICE_UNIT="sys-subsystem-net-devices-${TAILSCALE_IFACE}.device"
UDEV_RULE_PATH="/etc/udev/rules.d/99-tailscale-k3s.rules"
DROPIN_FILENAME="10-tailscale-binding.conf"
ACCEPT_RA_SYSCTL_PATH="/etc/sysctl.d/90-ipv6-accept-ra.conf"
TAILSCALED_ENV_PATH="/etc/default/tailscaled"
TAILSCALE_MTU="1350"

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  SUDO="sudo"
fi

# ---------------------------------------------------------------- detect the k3s unit ---

K3S_UNIT="${1:-}"
if [[ -z "$K3S_UNIT" ]]; then
  if [[ -f /etc/systemd/system/k3s.service ]]; then
    K3S_UNIT="k3s"
  elif [[ -f /etc/systemd/system/k3s-agent.service ]]; then
    K3S_UNIT="k3s-agent"
  fi
fi

if [[ -z "$K3S_UNIT" ]]; then
  echo "✅ $LOG_PREFIX No k3s unit on this host yet, nothing to bind (will be applied after install)"
  exit 0
fi

if [[ ! -f "/etc/systemd/system/${K3S_UNIT}.service" ]]; then
  echo "✅ $LOG_PREFIX Unit=[${K3S_UNIT}] not installed yet, nothing to bind"
  exit 0
fi

echo "👉 $LOG_PREFIX Hardening node networking for unit=[${K3S_UNIT}]"

DROPIN_DIR="/etc/systemd/system/${K3S_UNIT}.service.d"
DROPIN_PATH="${DROPIN_DIR}/${DROPIN_FILENAME}"

# ------------------------------------------------- disable Tailscale auto-updates (2) ---
# Done first: it is useful even when the binding below is refused.

if command -v tailscale &>/dev/null; then
  echo "👉 $LOG_PREFIX Disabling Tailscale auto-updates"
  if $SUDO tailscale set --auto-update=false 2>/dev/null; then
    echo "✅ $LOG_PREFIX Tailscale auto-updates disabled"
  else
    echo "⚠️ $LOG_PREFIX Could not disable Tailscale auto-updates (not logged in, or overridden by tailnet policy)"
  fi

  # Surface the effective value: a tailnet-wide policy can override the local preference,
  # which is how hetzner updated to 1.102.2 despite this being set at provisioning time.
  AUTO_UPDATE_PREFS="$($SUDO tailscale debug prefs 2>/dev/null | grep -iA3 '"AutoUpdate"' || true)"
  if [[ -n "$AUTO_UPDATE_PREFS" ]]; then
    echo "ℹ️ $LOG_PREFIX Effective AutoUpdate prefs:"
    echo "$AUTO_UPDATE_PREFS"
  fi
else
  echo "⚠️ $LOG_PREFIX tailscale binary not found, skipping auto-update configuration"
fi

# --------------------------------------------- verify the .device unit exists (safety) ---

echo "👉 $LOG_PREFIX Checking systemd device unit=[${DEVICE_UNIT}]"
if ! systemctl is-active --quiet "$DEVICE_UNIT" 2>/dev/null; then
  echo "❌ $LOG_PREFIX Device unit=[${DEVICE_UNIT}] is not active."
  echo "❌ $LOG_PREFIX Installing a BindsTo drop-in now would make unit=[${K3S_UNIT}] permanently unstartable."

  if [[ -f "$DROPIN_PATH" ]]; then
    echo "👉 $LOG_PREFIX Removing previously installed drop-in to avoid trapping k3s"
    $SUDO rm -f "$DROPIN_PATH"
    $SUDO systemctl daemon-reload
    echo "✅ $LOG_PREFIX Stale drop-in removed"
  fi

  echo "❌ $LOG_PREFIX Is ${TAILSCALE_IFACE} up? Run: ip -br link show ${TAILSCALE_IFACE}"
  exit 1
fi
echo "✅ $LOG_PREFIX Device unit=[${DEVICE_UNIT}] is active"

# ------------------------------------------------------ install the systemd drop-in (1) ---

echo "👉 $LOG_PREFIX Installing systemd drop-in at [${DROPIN_PATH}]"
$SUDO mkdir -p "$DROPIN_DIR"
$SUDO tee "$DROPIN_PATH" >/dev/null <<EOF
# Managed by provisioning/common/bootstrap-node-networking.sh - do not edit by hand.
#
# flannel.1 is a VXLAN child device of ${TAILSCALE_IFACE}. If the parent link is deleted the
# kernel deletes flannel.1 too, and a running k3s never rebuilds it - which silently kills
# all cross-node pod networking. Binding the two makes systemd stop k3s instead, and the
# companion udev rule at ${UDEV_RULE_PATH} starts it again when the interface returns.
#
# See issues/2026-08-15-firstvds-https-hangs-no-web-traffic.md
[Unit]
BindsTo=${DEVICE_UNIT}
After=${DEVICE_UNIT}
EOF
echo "✅ $LOG_PREFIX Drop-in installed"

# --------------------------------------------------------- install the udev rule (1/b) ---

echo "👉 $LOG_PREFIX Installing udev rule at [${UDEV_RULE_PATH}]"
$SUDO tee "$UDEV_RULE_PATH" >/dev/null <<EOF
# Managed by provisioning/common/bootstrap-node-networking.sh - do not edit by hand.
#
# BindsTo= stops ${K3S_UNIT} when ${TAILSCALE_IFACE} disappears but never starts it again.
# This rule closes that loop so the node recovers on its own when tailscaled comes back.
ACTION=="add|move", SUBSYSTEM=="net", KERNEL=="${TAILSCALE_IFACE}", TAG+="systemd", ENV{SYSTEMD_WANTS}+="${K3S_UNIT}.service"
EOF
echo "✅ $LOG_PREFIX udev rule installed"

# ------------------------------------------------------------------------- apply both ---

echo "👉 $LOG_PREFIX Reloading systemd and udev"
$SUDO systemctl daemon-reload
$SUDO udevadm control --reload-rules
echo "✅ $LOG_PREFIX systemd and udev reloaded"

# Verify the binding is actually in effect, so a silent typo cannot pass as success.
echo "👉 $LOG_PREFIX Verifying binding on unit=[${K3S_UNIT}]"
if systemctl show "$K3S_UNIT" -p BindsTo --value | grep -q "$DEVICE_UNIT"; then
  echo "✅ $LOG_PREFIX unit=[${K3S_UNIT}] is bound to [${DEVICE_UNIT}]"
else
  echo "❌ $LOG_PREFIX Binding did not take effect on unit=[${K3S_UNIT}]"
  exit 1
fi

# -------------------------------------------- accept IPv6 router advertisements (4) ---
# k3s sets net.ipv6.conf.all.forwarding=1, and with forwarding on the kernel ignores router
# advertisements unless accept_ra=2. A node that gets IPv6 from SLAAC would then have an
# address but no IPv6 default route. Harmless on a node without IPv6 or with a static route.

UPLINK_IFACE="$(ip -4 route show default | awk '{ for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit } }')"
if [[ -z "$UPLINK_IFACE" ]]; then
  echo "❌ $LOG_PREFIX Cannot detect the uplink interface (no IPv4 default route)"
  exit 1
fi

# sysctl uses "/" as the separator inside a key when the interface name contains "." (VLANs).
ACCEPT_RA_KEY="net.ipv6.conf.${UPLINK_IFACE//./\/}.accept_ra"

echo "👉 $LOG_PREFIX Setting [${ACCEPT_RA_KEY}=2] in [${ACCEPT_RA_SYSCTL_PATH}]"
$SUDO tee "$ACCEPT_RA_SYSCTL_PATH" >/dev/null <<EOF
# Managed by provisioning/common/bootstrap-node-networking.sh - do not edit by hand.
# Keep IPv6 SLAAC default routes while k3s enables IPv6 forwarding.
${ACCEPT_RA_KEY} = 2
EOF
$SUDO sysctl -q -p "$ACCEPT_RA_SYSCTL_PATH"

if [[ "$(sysctl -n "$ACCEPT_RA_KEY")" == "2" ]]; then
  echo "✅ $LOG_PREFIX ${ACCEPT_RA_KEY}=2"
else
  echo "❌ $LOG_PREFIX ${ACCEPT_RA_KEY} did not take effect"
  exit 1
fi

# ------------------------------------------------------------ Tailscale MTU (5) ---
# IPv6 VXLAN adds 70 bytes. On the default 1280 tailscale0 MTU the pod MTU would be 1210, and
# Linux disables IPv6 on interfaces below 1280, so dual-stack pods would get no IPv6 address.
# TS_DEBUG_MTU is an unsupported debug knob, so the result is verified and a no-op fails loudly.
#
# Placed after the binding above on purpose: restarting tailscaled deletes flannel.1, and
# k3s is restarted below so flannel rebuilds it with the new MTU.

get_tailscale_mtu() {
  cat "/sys/class/net/${TAILSCALE_IFACE}/mtu" 2>/dev/null || echo 0
}

TAILSCALED_ENV_FILES="$(systemctl show tailscaled -p EnvironmentFiles --value)"
if [[ "$TAILSCALED_ENV_FILES" != *"$TAILSCALED_ENV_PATH"* ]]; then
  echo "❌ $LOG_PREFIX tailscaled does not load [${TAILSCALED_ENV_PATH}] (EnvironmentFiles=[${TAILSCALED_ENV_FILES}])"
  exit 1
fi

TAILSCALE_MTU_LINE="TS_DEBUG_MTU=${TAILSCALE_MTU}"
if grep -qx "$TAILSCALE_MTU_LINE" "$TAILSCALED_ENV_PATH"; then
  echo "✅ $LOG_PREFIX [${TAILSCALE_MTU_LINE}] already in [${TAILSCALED_ENV_PATH}]"
else
  echo "👉 $LOG_PREFIX Writing [${TAILSCALE_MTU_LINE}] to [${TAILSCALED_ENV_PATH}]"
  $SUDO sed -i '/^TS_DEBUG_MTU=/d' "$TAILSCALED_ENV_PATH"
  echo "$TAILSCALE_MTU_LINE" | $SUDO tee -a "$TAILSCALED_ENV_PATH" >/dev/null
  echo "✅ $LOG_PREFIX [${TAILSCALE_MTU_LINE}] written"
fi

CURRENT_TAILSCALE_MTU="$(get_tailscale_mtu)"
if [[ "$CURRENT_TAILSCALE_MTU" == "$TAILSCALE_MTU" ]]; then
  echo "✅ $LOG_PREFIX ${TAILSCALE_IFACE} MTU is ${TAILSCALE_MTU}, no restart needed"
else
  # An SSH session over the tailnet stalls for a few seconds here; the tailnet IP does not
  # change, so TCP recovers once tailscaled is back.
  echo "👉 $LOG_PREFIX ${TAILSCALE_IFACE} MTU is ${CURRENT_TAILSCALE_MTU}, restarting tailscaled to apply ${TAILSCALE_MTU}"
  $SUDO systemctl restart tailscaled

  for _ in $(seq 1 30); do
    [[ "$(get_tailscale_mtu)" == "$TAILSCALE_MTU" ]] && break
    sleep 1
  done

  CURRENT_TAILSCALE_MTU="$(get_tailscale_mtu)"
  if [[ "$CURRENT_TAILSCALE_MTU" != "$TAILSCALE_MTU" ]]; then
    echo "❌ $LOG_PREFIX ${TAILSCALE_IFACE} MTU is [${CURRENT_TAILSCALE_MTU}] after restart, expected [${TAILSCALE_MTU}]"
    echo "❌ $LOG_PREFIX TS_DEBUG_MTU had no effect - check the tailscaled version"
    exit 1
  fi
  echo "✅ $LOG_PREFIX ${TAILSCALE_IFACE} MTU is ${TAILSCALE_MTU}"

  # The udev rule also starts k3s, but an explicit restart guarantees that flannel reads the
  # new MTU instead of relying on BindsTo having caught the short interface removal.
  echo "👉 $LOG_PREFIX Restarting unit=[${K3S_UNIT}] so flannel uses the new MTU"
  $SUDO systemctl restart "$K3S_UNIT"
  echo "✅ $LOG_PREFIX unit=[${K3S_UNIT}] restarted"

  echo "👉 $LOG_PREFIX Waiting for flannel.1"
  for _ in $(seq 1 60); do
    ip link show flannel.1 &>/dev/null && break
    sleep 1
  done
fi

# The overlay device itself must exist whenever tailscale0 does. Report only - repairing it
# here would mean restarting k3s mid-deployment, which is the caller's decision.
if ip link show flannel.1 &>/dev/null; then
  echo "✅ $LOG_PREFIX flannel.1 is present (mtu $(cat /sys/class/net/flannel.1/mtu)), cross-node pod networking is up"
else
  echo "⚠️ $LOG_PREFIX flannel.1 is MISSING while ${TAILSCALE_IFACE} is up - cross-node pod networking is down"
  echo "⚠️ $LOG_PREFIX Repair with: systemctl restart ${K3S_UNIT}"
fi

echo "✅ $LOG_PREFIX Node networking hardened"
