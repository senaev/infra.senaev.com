# Project worklog

## 2026-11-15 09:00 UTC — Root cause found, fix applied and verified after a reboot

The previous boot's journal (`journalctl -b -1`) shows `e1000e 0000:00:1f.6 nic0: Detected Hardware Unit Hang` from 02:42:27 CET, every 2 seconds, 12467 times, until the user replugged the power cable at 09:38 CET. The host and the VM kept running; only the network was gone. The VM's journal (`--list-boots`, boot `-2`) runs from 18:34 CET to 09:38:10 CET without a gap, so the VM was alive too. Other causes (power loss, panic, OOM, overheating, NVMe) are ruled out in the [README](README.md).

Decision: turn off TSO, GSO and GRO on `nic0`, at runtime and permanently (`post-up` line in `/etc/network/interfaces` of the host). The runtime change caused no gap in the metrics. After the user's reboot at 08:56 UTC, all three offloads are `off` and the current boot has 0 hangs.

Not decided: a local watchdog and an external heartbeat (both in the README as ❓). The follow-up check is on 2026-11-18.

Supporting output: [`sources/proxmox-madrid-nic-hang-excerpts.txt`](sources/proxmox-madrid-nic-hang-excerpts.txt).

## 2026-11-15 09:00 UTC — Project created

The user asked for an incident record and a task to check for new hangs in a few days. Created from the investigation of the night of 2026-11-14 → 2026-11-15, in a separate PR.
