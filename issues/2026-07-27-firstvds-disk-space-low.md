# 2026-07-27 — firstvds disk space alert (node-disk-space-low)

> This file is the working log for the investigation. All findings, command outputs,
> screenshots, hypotheses confirmed/refuted, and the eventual fix must be appended to
> this file as we go — so the whole debug session lives in one place and is searchable later.
>
> Format: append new dated sections under ## Findings as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Symptom

User reported "a lack of memory on firstvds, the alert has fired" — later clarified this
was the `node-disk-space-low` VMRule alert
(`provisioning/helm/senaev-com/templates/alerts.yaml:26-38`), not RAM. Confirmed firing
via `df -h` on the node:

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda3        15G  9.7G  4.3G  70% /
```

4.3Gi avail < 5Gi threshold on a 15G filesystem (>10Gi) → alert condition true.

## Context (architecture refresher)

- `firstvds` is a bare k3s worker VPS, **not Terraform-managed**
  (`terraform/terraform.tfvars:18-20`), IP `157.22.197.112`, root disk `/dev/vda3` = 15G,
  RAM 962Mi. Underwent a full OS reinstall on 2026-06-10
  (`issues/2026-06-10-debug-vpn-connection.md:425`).
- Workloads scheduled there: `xray-vpn-firstvds` (ns `senaev-com`), `traefik-firstvds`
  (ns `traefik`), `node-exporter`/`smokeping-prober` DaemonSets, `iperf3-agent-firstvds`
  (ns `telemetry`).
- Alerting: VictoriaMetrics/vmalert stack (`provisioning/helm/vm-stack`) evaluates the
  custom `senaev-com-alerts` VMRule (`provisioning/helm/senaev-com/templates/alerts.yaml`),
  routed to Telegram via `cluster-helper`'s `/alertmanager/webhook` endpoint.
- Datadog APM Single Step Instrumentation was configured cluster-wide for the
  `senaev-com` namespace (`provisioning/helm/datadog/values.yaml`, pre-fix:
  `enabledNamespaces: [senaev-com]`), with no exclusion for non-instrumentable workloads.
  This webhook is cluster-scoped — it fires for any pod in the namespace regardless of
  which node it's scheduled on, even though the Datadog Agent DaemonSet itself is
  restricted to `senaev-media`/`hetzner` only (`agents.affinity`, same file).
- No local `kubectl`; all cluster commands run via
  `ssh $CONTROL_PLANE_SERVER_USERNAME@$CONTROL_PLANE_SERVER_IP` (the `hetzner` control
  plane). Direct firstvds access: `ssh -J <control-plane> root@157.22.197.112`.

## Hypotheses, ranked

- **(A) Container log accumulation from `xray-vpn-firstvds` debug logging** — `loglevel: debug`
  logs every access/error to stdout, captured as container logs on an internet-exposed
  Reality endpoint subject to constant scans.
  Signal: large `/var/log/pods/senaev-com_xray-vpn-firstvds-*` directory.
  Fix: lower `loglevel`, verify kubelet log rotation.
  **Status: ruled out** — 352K total, kubelet rotation working fine.
- **(B) Uncapped systemd journald retention** — fresh OS install, no `SystemMaxUse` set.
  Signal: `journalctl --disk-usage` large; `journald.conf` has no cap.
  Fix: set `SystemMaxUse`, vacuum.
  **Status: confirmed** (secondary contributor) — 1.3G, no cap configured, but not driven
  by ssh brute-force noise (0 sshd entries in 24h).
- **(C) containerd image/snapshot garbage not cleaned up** — old image layers/orphaned
  overlay snapshots piling up from repeated pod recreations.
  Signal: `crictl images`/snapshot dir count far exceeds real image count; `du` on
  `agent/containerd` far exceeds sum of `crictl images` sizes.
  Fix: `crictl rmi --prune`, restart k3s-agent to trigger snapshot GC.
  **Status: confirmed as primary driver** — 3.3G total containerd footprint vs. ~0.9G of
  actual current image sizes; 145 overlay snapshot dirs vs. 51 image refs.
- **(D) Disk genuinely undersized** — 15G root disk for a k3s node running 5 workloads
  plus a 2G swapfile plus base OS.
  **Status: contributing factor**, not sole cause — cleanup (B)+(C)+(G) should restore
  comfortable headroom without resizing.
- **(E) Crash-looping pod generating excessive logs/restarts.**
  Signal: high `RESTARTS` count in `kubectl get pods`.
  **Status: ruled out** — all pods on firstvds show 0 restarts.
- **(F) Leftover artifacts from the June 10 OS reinstall.**
  **Status: ruled out** — `/root` and `/tmp` are clean.
- **(G) Datadog APM Single Step Instrumentation misapplied to `xray-vpn`** — namespace-wide
  `enabledNamespaces: [senaev-com]` with no per-workload exclusion caused the admission
  controller to inject 6 language-runtime init containers (java/js/python/ruby/php/dotnet)
  into a compiled Go binary that will never use any of them, on every pod restart.
  Signal: `crictl ps -a` on `xray-vpn-firstvds` shows exited `datadog-lib-*-init`
  containers; `crictl images` shows ~700-900MB of dd-lib-*-init images pulled.
  Fix: switch Datadog APM to an opt-in `targets`/`podSelector` model instead of
  namespace-wide `enabledNamespaces`.
  **Status: confirmed** — this is the specific mechanism amplifying hypothesis (C).

## Collaboration model

Commands are proposed by the assistant; the user runs them (SSH access, no direct
exec/SSH from the assistant). First round of commands was read-only (no writes,
restarts, or config changes) until the fault was localized.

## Round 1 diagnostic commands

```bash
# On control plane (hetzner):
kubectl describe node firstvds | grep -A5 "Conditions:\|Allocatable:\|Capacity:"
kubectl get pods -A -o wide --field-selector spec.nodeName=firstvds
kubectl get vmalert -A; kubectl get vmrule -n telemetry senaev-com-alerts -o yaml

# On firstvds:
df -h; free -h; lsblk
du -sh /var/log/* /var/lib/rancher/k3s/agent/containerd 2>/dev/null | sort -rh | head -20
du -sh /var/log/pods/*/ 2>/dev/null | sort -rh | head -20
journalctl --disk-usage
journalctl -u sshd --since "-24h" | tail -30
crictl images
crictl ps -a
mount | grep -v tmpfs
ls -lhS /root /tmp 2>/dev/null | head -20
```

| Command | Result | Hypothesis |
|---|---|---|
| `df -h` | 15G total, 9.7G used, 4.3G avail (70%) | Confirms alert firing now |
| `kubectl describe node` | No DiskPressure/MemoryPressure/PIDPressure condition; ephemeral-storage capacity 15350120Ki | Kubelet's own GC threshold not yet tripped |
| `kubectl get pods ... firstvds` | 5 pods, all 0 restarts | Rules out (E) |
| `du /var/log/*` `agent/containerd` | containerd 3.3G, journal 1.3G, pods 33M | Points at (C) and (B); rules out (A) |
| `free -h`/`lsblk` | Swap 2.5Gi total = zram 481M + `/swapfile` 2G on disk | Surfaces the on-disk swapfile as a disk consumer |
| `journalctl -u sshd --since -24h` | 0 entries | Rules out brute-force-driven journal growth |
| `crictl images`/`crictl ps -a` | 21 unique images incl. 6 Datadog `dd-lib-*-init`; 7 exited init containers on `xray-vpn-firstvds` from its last restart | Confirms (G) |
| `mount`/`ls -lhS /root /tmp` | Clean, nothing unusual | Rules out (F) |

## Round 2 diagnostic commands

```bash
# On firstvds:
du -sh --max-depth=1 / 2>/dev/null | sort -rh
du -sh /var/lib/rancher/k3s/* 2>/dev/null | sort -rh
swapon --show; cat /proc/swaps
find / -xdev -maxdepth 3 \( -iname "*swapfile*" -o -iname "*.swap" \) 2>/dev/null -exec ls -lh {} \;
du -sh /var/cache/apt/archives 2>/dev/null
ctr -n k8s.io images ls | wc -l
find /var/lib/rancher/k3s/agent/containerd/io.containerd.snapshotter.v1.overlayfs/snapshots -maxdepth 1 -type d 2>/dev/null | wc -l
grep -v '^#' /etc/systemd/journald.conf | grep -v '^$'
```

| Command | Result | Hypothesis |
|---|---|---|
| `du /var/lib/rancher/k3s/*` | `agent` 3.3G (all in containerd), `data` 237M | Confirms containerd is the entire agent footprint |
| `swapon --show`/`/proc/swaps` | `/swapfile` 2.0G file, priority -2, 0B currently used; `zram0` 481M | Confirms 2G swapfile living on the 15G root disk |
| `du /var/cache/apt/archives` | 74M | Minor, not a real driver |
| `ctr images ls` vs snapshot dir count | 51 image refs vs **145 snapshot directories** | Confirms (C) — far more layers on disk than current images account for |
| `journald.conf` | Only `[Journal]` header, all directives commented/default | Confirms (B) — uncapped retention |
| `du --max-depth=1 /` | *(command produced no output when run — likely swallowed by permission errors across overlay mounts)* | Inconclusive; remaining ~2.7G unaccounted for is consistent with base OS footprint (Debian minimal + kernel/systemd), not independently confirmed |

### Disk accounting (9.7G used of 15G)

```
containerd (images + orphaned snapshots)  3.3G   ← ~0.9G real images, ~2.4G excess snapshot overhead
journald (uncapped)                       1.3G
swapfile                                  2.0G
k3s binaries/data                         0.24G
apt cache                                 0.07G
pod logs                                  0.03G
base OS (unconfirmed remainder)          ~2.7G
```

## Root cause

**Primary:** `provisioning/helm/datadog/values.yaml` enabled Datadog APM Single Step
Instrumentation for the entire `senaev-com` namespace (`enabledNamespaces: [senaev-com]`)
with no exclusion. This caused the admission controller to inject 6 unnecessary
language-runtime init containers into `xray-vpn-firstvds` (a compiled Go binary) on every
pod restart, pulling ~900MB of images and contributing to a containerd snapshot
footprint (3.3G total, 145 snapshot dirs) far exceeding the actual number of images in
use (51 refs, ~0.9G).

**Secondary:** uncapped journald retention (1.3G, no `SystemMaxUse`), and a small 15G
root disk carrying a 2G on-disk swapfile alongside 5 scheduled workloads.

## Fix options

- [x] **(G) Code fix — applied**: switched `provisioning/helm/datadog/values.yaml` APM
  instrumentation from `enabledNamespaces` (opt-out model) to `targets`/`podSelector`
  matching the native `admission.datadoghq.com/enabled: "true"` label (opt-in model,
  Datadog's recommended production pattern). Only workloads explicitly carrying that
  label are now instrumented: `cluster-helper`, `nextjs-app`, `webhook-endpoint`,
  `media-server-helper`, `vpn-subscription`, `log-generator` (pre-existing), plus
  `obsidian-sync` and `opencode-telegram`/`opencode-serve` (newly added per user
  decision). `xray-vpn` and all third-party workloads (traefik, jellyfin, qbittorrent,
  prowlarr, n8n, browserless, filebrowser, flaresolverr, unmanic, webdav) are never
  instrumented.
  Requires `make datadog` (redeploys the Datadog Helm release) and `make senaev-com`
  (redeploys/relabels `obsidian-sync` and `opencode-telegram` so their pods pick up the
  new labels) run against the control plane.
- [ ] **(C) Manual — pending**: `crictl rmi --prune` on firstvds to drop unused images,
  then `systemctl restart k3s-agent` to trigger containerd snapshot GC for orphaned
  overlay layers. Expected reclaim: several hundred MB to ~2G.
- [ ] **(B) Manual — pending**: add `SystemMaxUse=300M` under `[Journal]` in
  `/etc/systemd/journald.conf`, `systemctl restart systemd-journald`,
  `journalctl --vacuum-size=300M`. Expected reclaim: ~1G.
- [ ] **(minor) Manual — pending**: `apt clean` on firstvds. Expected reclaim: 74M.
- **(D) Not recommended right now**: shrinking/removing the 2G `/swapfile`. RAM is
  tight (962Mi total, ~325Mi available, swap already has 141Mi in active use) —
  revisit only if disk pressure recurs after the above.
- **(D) Longer term**: if disk pressure recurs after cleanup, resize the firstvds VPS
  disk via the provider panel — 15G is small for this node's current workload count.

## Verification

After manual steps: `df -h` on firstvds shows sustained availability above 5Gi for
`/dev/vda3` over several hours, and the `node-disk-space-low` alert clears in
Alertmanager (`alertmanager.senaev.com`) / stops firing to Telegram. After the code fix
is deployed: `crictl ps -a` on any *newly created* `xray-vpn-firstvds` pod (e.g. after a
future redeploy) should show no `datadog-lib-*-init` containers, and `crictl images`
should stop accumulating those image layers over time.

## Findings

*(append results below)*

### 2026-07-27 — Code fix applied

- `provisioning/helm/datadog/values.yaml`: replaced `apm.instrumentation.enabledNamespaces`
  with an opt-in `targets` block matching `admission.datadoghq.com/enabled: "true"`.
- `provisioning/helm/senaev-com/templates/obsidian-sync.yaml`: added
  `admission.datadoghq.com/enabled: "true"` + `tags.datadoghq.com/*` labels to the pod
  template (user opted in).
- `provisioning/helm/senaev-com/templates/opencode-serve.yaml`: added the same labels to
  the `opencode-telegram` pod template, covering both the `opencode-serve` and
  `opencode-telegram-bot` containers (user opted in).
- No changes needed to `cluster-helper`, `nextjs-app`, `webhook-endpoint`,
  `media-server-helper`, `vpn-subscription`, `log-generator` — they already carried the
  `admission.datadoghq.com/enabled: "true"` label from prior work, which now doubles as
  the opt-in selector.
- `xray-vpn.yaml` was left untouched (no label) — it's excluded by default under the new
  opt-in model, no explicit opt-out annotation needed.

Still pending: deploy (`make datadog`, `make senaev-com`), and the manual host cleanup
steps (C), (B), and apt clean on firstvds.
