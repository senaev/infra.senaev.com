# 2026-11-15 — proxmox-madrid stopped responding at night

Find why the `proxmox-madrid` host and its VM `senaev-madrid` were cut off from the network for about 7 hours, and make sure that it does not happen again.

## Goal

During the night of 2026-11-14 → 2026-11-15, `proxmox-madrid` stopped responding. The machine was on, but nothing could reach it. The only way to recover was to unplug and plug in the power cable at 09:38 CET.

## Context

- `proxmox-madrid` is a sensitive node: a k3s worker on the Proxmox VE host itself, reachable only over the tailnet. See [`AGENTS.md`](../../AGENTS.md) and [`2026-10-18-16-05-home-development-llm-server`](../2026-10-18-16-05-home-development-llm-server/README.md).
- VM 100 `senaev-madrid` runs on it. The VM runs the whole telemetry stack (`vmsingle`, `vmagent`, Grafana, Alertmanager), so all metrics for every node stopped during the incident, and nothing could send an alert.
- The VM is bridged through `vmbr0` to the physical card `nic0`: Intel `e1000e`, PCI `0000:00:1f.6`, kernel `7.0.2-6-pve`.
- Times below are CET (UTC+1) unless marked UTC.

## Timeline

| Time | Event |
|---|---|
| 02:42:27 CET (01:42 UTC) | First `e1000e ... nic0: Detected Hardware Unit Hang` in the kernel log. It repeats every 2 seconds: 12467 times until 09:38. |
| about 02:42 CET | Last packet that Tailscale received from hetzner (`lastRecv=6h55m` at 09:37:28). |
| about 02:45 CET (01:45 UTC) | Last metrics sample of all nodes. |
| 02:42 – 09:38 CET | The kernel, k3s and tailscaled keep running and log `network is unreachable`, `no route to host`, `TLS handshake timeout`. VM 100 also keeps running (its journal has no gap). |
| 09:38 CET (08:38 UTC) | The user unplugs and plugs in the power cable. Host boots at 08:38:33 UTC, VM at 08:38:59 UTC. |
| before 08:54 UTC | The user turns the offloads off at runtime. The metrics show no gap. |
| 08:56 UTC | The user reboots to test the permanent setting. It works. |

A second gap of all nodes, 22:50 – 23:35 UTC on 2026-11-14, has no host reboot. It was probably a deploy that restarted the monitoring pods. It was not checked and is not related.

## Plan

Hypotheses, ranked, with the signal that decided each one:

1. ✅ **TX hang of the `e1000e` network card.** Confirmed by the kernel log: `Detected Hardware Unit Hang` with `TDH <11>` and `TDT <63>` that never change, and no recovery by the driver. The usual cause is the offload features TSO, GSO and GRO (they were `on`).
2. ✅ Power loss: ruled out. The host kept running and logging.
3. ✅ Kernel panic, OOM, overheating: ruled out. No such messages; before the stop the load was about 0.3, 6.4 GB of 33 GB memory was free, no swap, no memory or I/O pressure, CPU cores 62–72 °C.
4. ✅ NVMe failure: ruled out. SMART `PASSED`, 1% used, no media errors, 43 °C.

Fix and follow-up:

1. ✅ Turn the offloads off at runtime: `ethtool -K nic0 tso off gso off gro off`.
2. ✅ Make it permanent: `post-up /usr/sbin/ethtool -K nic0 tso off gso off gro off` in the `iface nic0 inet manual` stanza of `/etc/network/interfaces` on the host. Backup of the old file: `/root/interfaces.bak-2026-11-15` on the host.
3. 📌 **On 2026-11-18, check for new hangs** on the host: `journalctl --no-pager -k | grep -c "Hardware Unit Hang"`. `0` means that the fix works. Also check that `ethtool -k nic0` still shows TSO, GSO and GRO `off`.
4. 📌 If a hang comes back, try in this order: EEE off (`ethtool --set-eee nic0 eee off`, now `enabled - inactive`), then the kernel option `pcie_aspm=off`.
5. ❓ The host stayed alive while it had no network. A local watchdog (for example a systemd timer that reloads `e1000e` or reboots the host when the gateway is unreachable for 5 minutes) could fix this without a person. It changes a sensitive node, so it needs a decision first.
6. ❓ Nothing alerts on this failure, because Alertmanager runs on the VM that is cut off. An external check (a heartbeat from outside Madrid) could close this gap.

## Verification

After the reboot of 08:56 UTC, the user checked on the host:

```
ethtool -k nic0 | grep -E "tcp-segmentation-offload|generic-segmentation-offload|generic-receive-offload"
tcp-segmentation-offload: off
generic-segmentation-offload: off
generic-receive-offload: off
journalctl --no-pager -b 0 -k | grep -c "Hardware Unit Hang"
0
```

`tailscale status` shows all nodes active, `qm list` shows VM 100 `running`, and the metrics show all 7 node-exporters `up` and all 7 nodes `Ready`.

## Result

Root cause: the `e1000e` network card `nic0` got a transmit hang at 02:42 CET and the driver did not recover it, so the host and the VM had no network until the power cable was replugged. The fix (offloads off, permanent) works after a reboot. Open: the check of 2026-11-18 and the two ❓ points above.

Raw excerpts are in [`sources/`](sources/).
