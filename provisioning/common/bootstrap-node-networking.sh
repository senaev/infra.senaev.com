#!/usr/bin/env bash
set -euo pipefail

# Harden node networking without stopping k3s when tailscale0 disappears.
# K3s >= v1.36.2+k3s1 passes the interface name to Flannel's native VXLAN
# recreation loop (k3s-io/k3s#14086). The old BindsTo/udev pair can instead
# leave k3s stopped after a short Tailscale restart; remove those managed files.
# See projects/2026-06-10-debug-vpn-connection/K3S-TAILSCALE-RECOVERY.md.
#
# Retains auto-update preferences, OOM protection, key-expiry checks, IPv6 RA
# and MTU configuration. The existing MTU correction can restart services;
# use the narrow migration commands in the guide for existing nodes.
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
TAILSCALED_OOM_DROPIN_PATH="/etc/systemd/system/tailscaled.service.d/oom-score.conf"
TAILSCALED_OOM_SCORE_ADJ="-1000"

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
  echo "✅ $LOG_PREFIX No k3s unit on this host yet, nothing to configure (will be applied after install)"
  exit 0
fi

if [[ ! -f "/etc/systemd/system/${K3S_UNIT}.service" ]]; then
  echo "✅ $LOG_PREFIX Unit=[${K3S_UNIT}] not installed yet, nothing to configure"
  exit 0
fi

echo "👉 $LOG_PREFIX Hardening node networking for unit=[${K3S_UNIT}]"

DROPIN_DIR="/etc/systemd/system/${K3S_UNIT}.service.d"
DROPIN_PATH="${DROPIN_DIR}/${DROPIN_FILENAME}"

# Fail before changing host configuration on versions not covered by this migration.
# Older release branches may also contain the upstream fix; upgrade/verify separately.
K3S_VERSION="$(k3s --version | awk 'NR == 1 { print $3 }')"
if [[ ! "$K3S_VERSION" =~ ^v1\.([0-9]+)\.([0-9]+)\+k3s[0-9]+$ ]] ||
   (( 10#${BASH_REMATCH[1]:-0} < 36 || (10#${BASH_REMATCH[1]:-0} == 36 && 10#${BASH_REMATCH[2]:-0} < 2) )); then
  echo "❌ $LOG_PREFIX Native recovery migration requires stable K3s >= v1.36.2+k3s1; found ${K3S_VERSION}"
  exit 1
fi

# ------------------------------------------------- disable Tailscale auto-updates (2) ---
# Keep the effective preference visible; tailnet policy can override it.

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

# --------------------------------------------- protect tailscaled from the OOM killer (6) ---
# Without it, the kernel OOM killer can select tailscaled when a pod fills the node memory,
# and a home node then has no way in. The drop-in covers future starts; the running process
# is updated in place, because restarting tailscaled is a risk of its own on a flaky uplink.

if systemctl cat tailscaled &>/dev/null; then
  echo "👉 $LOG_PREFIX Setting OOMScoreAdjust=${TAILSCALED_OOM_SCORE_ADJ} for tailscaled"
  $SUDO mkdir -p "$(dirname "$TAILSCALED_OOM_DROPIN_PATH")"
  $SUDO tee "$TAILSCALED_OOM_DROPIN_PATH" >/dev/null <<EOF
# Managed by provisioning/common/bootstrap-node-networking.sh - do not edit by hand.
# Keep the node reachable over the tailnet when a pod fills the node memory.
[Service]
OOMScoreAdjust=${TAILSCALED_OOM_SCORE_ADJ}
EOF
  $SUDO systemctl daemon-reload

  TAILSCALED_PID="$(systemctl show tailscaled -p MainPID --value)"
  if [[ "$TAILSCALED_PID" != "0" ]]; then
    echo "$TAILSCALED_OOM_SCORE_ADJ" | $SUDO tee "/proc/${TAILSCALED_PID}/oom_score_adj" >/dev/null
  fi

  if [[ "$(systemctl show tailscaled -p OOMScoreAdjust --value)" != "$TAILSCALED_OOM_SCORE_ADJ" ]]; then
    echo "❌ $LOG_PREFIX OOMScoreAdjust drop-in did not take effect for tailscaled"
    exit 1
  fi
  if [[ "$TAILSCALED_PID" != "0" ]] && [[ "$(cat "/proc/${TAILSCALED_PID}/oom_score_adj")" != "$TAILSCALED_OOM_SCORE_ADJ" ]]; then
    echo "❌ $LOG_PREFIX oom_score_adj of the running tailscaled (pid ${TAILSCALED_PID}) is not ${TAILSCALED_OOM_SCORE_ADJ}"
    exit 1
  fi
  echo "✅ $LOG_PREFIX tailscaled is protected from the OOM killer"
else
  echo "⚠️ $LOG_PREFIX tailscaled unit not found, skipping OOM protection"
fi

# ------------------------------------------------ require Tailscale key expiry off (7) ---
# An expired node key logs tailscaled out, and the node drops off the tailnet. On hetzner
# this made every worker NotReady; on a home node it would leave no way in. Key expiry can
# only be disabled in the Tailscale admin console, so this step checks and fails loudly.

if command -v tailscale &>/dev/null; then
  echo "👉 $LOG_PREFIX Checking Tailscale login state and node key expiry"
  TAILSCALE_SELF_STATUS="$($SUDO tailscale status --json --peers=false)"
  if ! grep -Eq '"BackendState": *"Running"' <<<"$TAILSCALE_SELF_STATUS"; then
    echo "❌ $LOG_PREFIX tailscaled is not logged in and running. Check: tailscale status"
    exit 1
  fi
  # The field is omitted when key expiry is disabled for this machine.
  TAILSCALE_KEY_EXPIRY="$(grep -Eo '"KeyExpiry": *"[^"]*"' <<<"$TAILSCALE_SELF_STATUS" || true)"
  if [[ -n "$TAILSCALE_KEY_EXPIRY" ]]; then
    echo "❌ $LOG_PREFIX Tailscale node key expires (${TAILSCALE_KEY_EXPIRY})."
    echo "❌ $LOG_PREFIX Disable key expiry for this machine: https://login.tailscale.com/admin/machines"
    exit 1
  fi
  echo "✅ $LOG_PREFIX Tailscale is running and its node key does not expire"
fi

# --------------------------------------- remove obsolete interface restart coupling ---

# Only these two files were managed by the former binding/recovery workaround.
$SUDO rm -f "$DROPIN_PATH" "$UDEV_RULE_PATH"
$SUDO systemctl daemon-reload
$SUDO udevadm control --reload-rules
K3S_BINDS_TO="$(systemctl show "$K3S_UNIT" -p BindsTo --value)"
if grep -Fwq "$DEVICE_UNIT" <<<"$K3S_BINDS_TO"; then
  echo "❌ $LOG_PREFIX Another drop-in still binds ${K3S_UNIT} to ${DEVICE_UNIT}; inspect systemctl cat ${K3S_UNIT}"
  exit 1
fi
echo "✅ $LOG_PREFIX Obsolete interface binding removed; no service restart requested"

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
# A changed MTU still needs an explicit k3s restart so Flannel reads the new value.

get_tailscale_mtu() {
  cat "/sys/class/net/${TAILSCALE_IFACE}/mtu" 2>/dev/null || echo 0
}

has_tailscale_addresses() {
  [[ -n "$(ip -4 -o addr show dev "$TAILSCALE_IFACE" 2>/dev/null)" ]] &&
    [[ -n "$(ip -6 -o addr show dev "$TAILSCALE_IFACE" scope global 2>/dev/null)" ]]
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

  # The MTU is set when the interface is created, but the tailnet IPs arrive later, and k3s
  # exits at startup without them: "interface tailscale0 does not have a correct global
  # unicast ip". Dual-stack flannel needs the IPv6 address as well.
  echo "👉 $LOG_PREFIX Waiting for IPv4 and IPv6 addresses on ${TAILSCALE_IFACE}"
  for _ in $(seq 1 30); do
    has_tailscale_addresses && break
    sleep 1
  done
  if ! has_tailscale_addresses; then
    echo "❌ $LOG_PREFIX ${TAILSCALE_IFACE} has no IPv4 or no global IPv6 address after tailscaled restart"
    exit 1
  fi
  echo "✅ $LOG_PREFIX ${TAILSCALE_IFACE} has IPv4 and IPv6 addresses"

  # Native interface recreation is not a live MTU reconfiguration mechanism.
  # Restart explicitly after an MTU change; retain systemd's startup retry budget.
  echo "👉 $LOG_PREFIX Restarting unit=[${K3S_UNIT}] so flannel uses the new MTU"
  if ! $SUDO systemctl restart "$K3S_UNIT"; then
    echo "⚠️ $LOG_PREFIX First start of unit=[${K3S_UNIT}] failed, waiting for systemd to retry"
  fi
  for _ in $(seq 1 90); do
    systemctl is-active --quiet "$K3S_UNIT" && break
    sleep 1
  done
  if ! systemctl is-active --quiet "$K3S_UNIT"; then
    echo "❌ $LOG_PREFIX unit=[${K3S_UNIT}] is not active 90s after restart"
    echo "❌ $LOG_PREFIX Inspect: journalctl -u ${K3S_UNIT} --since -5min --no-pager"
    exit 1
  fi
  echo "✅ $LOG_PREFIX unit=[${K3S_UNIT}] is active"

  echo "👉 $LOG_PREFIX Waiting for flannel.1"
  for _ in $(seq 1 60); do
    ip link show flannel.1 &>/dev/null && break
    sleep 1
  done
fi

# The overlay device itself must exist whenever tailscale0 does. Report only - repairing it
# here would mean restarting k3s mid-deployment, which is the caller's decision.
if ip link show flannel.1 &>/dev/null; then
  echo "✅ $LOG_PREFIX flannel.1 is present (mtu $(cat /sys/class/net/flannel.1/mtu)); verify cross-node traffic separately"
else
  echo "⚠️ $LOG_PREFIX flannel.1 is MISSING while ${TAILSCALE_IFACE} is up - cross-node pod networking is down"
  echo "⚠️ $LOG_PREFIX Repair with: systemctl restart ${K3S_UNIT}"
fi

if ip link show flannel-v6.1 &>/dev/null; then
  echo "✅ $LOG_PREFIX flannel-v6.1 is present (mtu $(cat /sys/class/net/flannel-v6.1/mtu)); verify IPv6 traffic separately"
else
  echo "⚠️ $LOG_PREFIX flannel-v6.1 is MISSING - IPv6 pod networking is down (expected only on a cluster created before dual-stack)"
  echo "⚠️ $LOG_PREFIX Repair with: systemctl restart ${K3S_UNIT}"
fi

echo "✅ $LOG_PREFIX Node networking hardened"
