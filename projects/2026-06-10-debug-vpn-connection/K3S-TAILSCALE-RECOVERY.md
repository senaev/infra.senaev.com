# K3s / Tailscale recovery migration

## Evidence and scope

On 2026-11-10 at 06:26:31 UTC, Hetzner's journal showed Flannel trying to
recreate its VXLAN device after a Tailscale update, immediately followed by
systemd stopping K3s. Tailscale returned; K3s remained inactive. The managed
`BindsTo=tailscale0.device` dependency stops K3s deliberately, so `Restart=always`
does not bring it back. Its companion udev rule did not recover this incident.
FirstVDS SSH authentication failed; its precise failing hop is still unconfirmed.
Do not treat the website's FirstVDS entry IP as evidence that only FirstVDS failed.

[K3s #14086](https://github.com/k3s-io/k3s/pull/14086) fixes passing the external
interface name to Flannel's existing recreation loop. The repository pins
v1.36.5+k3s1 (Flannel v0.28.4); inspected installed-version metrics agreed.
[Upstream QA](https://github.com/k3s-io/k3s/issues/12436) validated the fix.
The script conservatively requires a stable v1.36.2+k3s1 or newer on the 1.36+
line; older backported branches and prereleases require separate verification.
There is no K3s upgrade, experimental `--vpn-auth` migration, timer or new daemon.

The PR removes installation of two managed files and removes existing copies when
the networking bootstrap is explicitly run. Other safeguards remain: Tailscale
update preferences, OOM protection, key-expiry checks, IPv6 RA and MTU settings.
Removing the binding also removes its device `After=` ordering. Existing K3s
network-online ordering and startup retries remain; cold-boot readiness needs
validation too. Native recreation cannot recover Tailscale itself or an expired key.

## Rollout: one host at a time, not automatic on merge

CI only syncs provisioning when charts are selected; bootstrap-only changes do
not select charts. A merge can also retry earlier undeployed application changes,
because the planner compares with the last successful deployment. CI never
executes this host bootstrap. No live
changes or fault injection were performed for this PR. Start with fresh read-only
checks on Hetzner and FirstVDS: `k3s --version`, `systemctl status k3s` (or
`k3s-agent`), `systemctl cat` of that unit, `tailscale status`, `ip -br address
show tailscale0`, and `journalctl -u k3s --since -10min --no-pager`.
Confirm stable supported K3s, healthy Tailscale IPv4/IPv6, and console/recovery
access. Use Hetzner as the first canary because its dependency stop is confirmed;
then investigate FirstVDS independently. Leave both home nodes untouched.

Do **not** run the full control-plane/worker bootstrap for this migration: the
worker installer can remove agent state, and the common networking bootstrap
can restart Tailscale/K3s if MTU differs. Use only the following narrow commands
on the selected host after approval, in a root Bash session. Choose the actual
installed unit; use `k3s-agent` on a worker. Inspect the files first; stop if their
contents differ from the managed binding and rule described above.

```bash
set -euo pipefail
unit=k3s
binding="/etc/systemd/system/${unit}.service.d/10-tailscale-binding.conf"
rule=/etc/udev/rules.d/99-tailscale-k3s.rules
k3s --version
systemctl cat "$unit"
cat "$binding" "$rule"
# Continue only after verifying the supported version and managed file contents.
backup=$(mktemp -d /root/k3s-tailscale-backup.XXXXXX)
cp -a "$binding" "$backup/binding.conf"
cp -a "$rule" "$backup/recovery.rules"
printf 'Rollback files: %s\n' "$backup"
rm -f "$binding" "$rule"
systemctl daemon-reload
udevadm control --reload-rules
systemctl show "$unit" -p BindsTo -p After -p ActiveState -p NRestarts
```

No restart is required for a running K3s. If it is already stopped, starting it
is a separate recovery action: `systemctl start "$unit"`. Do not reinstall or
rebuild the host. Reloading rules does not replay udev events; no `udevadm trigger`
is needed. A cached device Wants property may remain until device recreation;
it does not reinstate the removed K3s BindsTo relationship.

Rollback in the same root shell (or set `backup` to the printed directory):

```bash
cp -a "$backup/binding.conf" "$binding"
cp -a "$backup/recovery.rules" "$rule"
systemctl daemon-reload
udevadm control --reload-rules
systemctl show "$unit" -p BindsTo -p After -p ActiveState
```

Rollback restores the old behavior, including its known missed-restart risk.
It does not itself start a stopped service. Do not bind to an absent device.

## Acceptance and remaining uncertainty

After the canary, verify direct SSH, Tailscale connectivity, K3s/API availability,
Flannel IPv4/IPv6 devices, cross-node pod traffic in both families, pod DNS and
service routing, then `./scripts/smoke-test-websites.sh` and VPN probe logs/metrics.
Use a host with the correct personal-cluster kubeconfig for cluster commands;
do not use the Code Tools pod's implicit context. Cached kube-state Ready metrics
and existence of flannel.1 alone do not establish working networking.

A controlled Tailscale restart is **not** included in approval of this PR. Before
requesting it, confirm both home nodes are fully connected, independent console
access and the rollback path. Observe K3s stays running and cross-node IPv4/IPv6,
DNS, services and websites recover after interface recreation. Flannel's device
recreation does not by itself prove peer route/FDB/ARP restoration; this is the
main remaining runtime uncertainty. Also validate a later approved cold boot.
Stop rollout on failed traffic checks; do not migrate home nodes automatically.
