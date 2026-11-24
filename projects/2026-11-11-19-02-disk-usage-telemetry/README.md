# 2026-11-11 — Disk usage telemetry

- [x] **Status: closed on 2026-11-18.** Low-space alerts name the VPS and match the k3s eviction threshold, and a heartbeat reports to Telegram when the alerting stack itself is down. The disk usage collector was not built.

## Goal

- Low-space alerts and notifications show a stable VPS name and enough data to act.
- ~~We can see which directories and files use the space, at a low cost for the node.~~ Dropped, see Result.
- Keep new code to a minimum; reuse the existing metrics stack.
- Added during the work: know when the alerting itself is down. vmagent, VMSingle, vmalert
  and Alertmanager all run on senaev-madrid, so an outage of that node was silent.

## Context

- Earlier incident: [firstvds disk space low](../2026-07-27-firstvds-disk-space-low/).
- The `/code` PVC uses `local-path`, which does not enforce its size. Worktrees with their own
  `node_modules` fill the root disk of the node.
- Alert rules: [`provisioning/helm/senaev-com/templates/alerts.yaml`](../../provisioning/helm/senaev-com/templates/alerts.yaml).
  Alertmanager routes: [`provisioning/helm/telemetry/vm-stack/values.yaml`](../../provisioning/helm/telemetry/vm-stack/values.yaml).
  Telegram messages: [`cluster-helper/src/alerts/`](../../cluster-helper/src/alerts/).
- k3s evicts pods below 5% free on the disk of the kubelet and containerd (`/` on every node):
  `evictionHard` `nodefs.available` and `imagefs.available` in
  [k3s `pkg/daemons/agent/agent.go`](https://github.com/k3s-io/k3s/blob/master/pkg/daemons/agent/agent.go),
  not overridden by our install scripts.

## Plan

The original plan was challenged at the start (see the worklog of 2026-11-18). What was done:

1. ✅ VPS name and readable alert messages — PRs #220, #221.
2. ✅ Alert threshold equal to the k3s eviction threshold, root disk only — PR #222.
3. ✅ Alerting heartbeat (dead man's switch) — PR #223.

Not done, by the user's decision (details in Result): the disk usage collector and its trial
scan, an early "filling up" alert, a node-exporter-down alert, worktree cleanup, an external
watcher, and a `[probe]` prefix for probe request logs.

## Verification

- A disk alert in Telegram has one field per line and a `VPS:` line, e.g. for galkin (seen on
  2026-11-18).
- `node-disk-space-low` is loaded in vmalert as
  `node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.05`.
- cluster-helper logs a call to `/alertmanager/heartbeat` every 1–2 minutes (Alertmanager
  repeats on its 30-second ticks), and no `Alerting is down` message is sent while the stack
  works. Checked on 2026-11-18 after the deploy: heartbeats at 19:44, 19:46, 19:47 UTC.
- Not yet done: the outage test. Scale Alertmanager to 0 for about 6 minutes; Telegram must get
  `🚨 Alerting is down`, then `✅ Alerting recovered` after scaling back. All alerting is off
  during the test, so the user runs it:

  ```bash
  kubectl -n telemetry scale vmalertmanager vm-stack-victoria-metrics-k8s-stack --replicas=0
  # wait ~6 minutes, then:
  kubectl -n telemetry scale vmalertmanager vm-stack-victoria-metrics-k8s-stack --replicas=1
  ```

## Result

### Done

- **VPS name in node alerts (#220).** The node-exporter scrape adds a `node` label (the
  Kubernetes node name) to every node-exporter series, so node alerts say `VPS: galkin` instead
  of a tailnet IP and an exporter pod.
- **Readable Telegram alerts (#220).** Each field is on its own line: Telegram Markdown joined
  plain newlines. The message shows the `summary` and `description` annotations, and skips
  `VPS`, `Job` or `Pod` when an alert has no such label, instead of failing with
  "Error handling Alertmanager webhook". The handler no longer logs the whole webhook body.
- **Datadog log level (#221).** The alert state is logged as `alertStatus`: Datadog read
  `status: firing` as the log level `emergency`.
- **Threshold = k3s eviction (#222).** `node-disk-space-low` fires below 5% free on `/`, with
  the summary `<n>% free on / (<device>); k3s evicts pods below 5%`. It replaced "below 5 GiB
  on any filesystem over 10 GiB", which had fired every day for galkin (a steady 3.7 GiB free
  of 14.7 GiB). Other disks are not watched: media-server-helper keeps senaev-media
  `/mnt/sdb1` at 95–98% used on purpose. Known limit: the alert fires when eviction starts, not
  before it; 10% was offered and declined.
- **Alerting heartbeat (#223).** The always-firing `alerting-heartbeat` rule is true only while
  node-exporter samples are fresh. Alertmanager sends it every minute to
  `POST /alertmanager/heartbeat` of cluster-helper, which runs on hetzner. After 5 minutes
  without a heartbeat, cluster-helper posts `🚨 Alerting is down` once, and `✅ Alerting
  recovered` when heartbeats return; failed sends are retried, and a restart waits 5 minutes
  before judging. Code: `cluster-helper/src/alerts/alertingHeartbeatMonitor.ts`; described in
  the root `AGENTS.md`.

### Not done, by the user's decision

- **Disk usage collector** (hourly scan of directory sizes and the top 20 files through the
  node-exporter textfile collector, with a trial scan on galkin). Not built: it would need
  privileged host access, would not finish in time on `/code` worktrees, and would not have
  explained the firstvds incident. A one-off scan started when needed was suggested instead
  and not built either. There is still no "top files" metric for nodes; the only ones are
  `obsidian_vault_largest_file_bytes` (the Obsidian vault) and media-server-helper (only
  `/downloads` on senaev-media).
- **Early warning before eviction.** The chart's stock `NodeFilesystemSpaceFillingUp` ("full
  within 24 h / 4 h") is evaluated but routed to the blackhole receiver; not routed to Telegram.
- **node-exporter down alert.** If the exporter of a node stops, the disk alert of that node
  disappears silently.
- **Prevention.** No automatic cleanup of merged `/code` worktrees. The galkin workspace still
  declares 3 × 8 Gi of volumes on a 14.7 GiB disk.
- **External watcher.** The heartbeat does not cover an outage of hetzner itself (cluster-helper
  and the control plane). An outside service such as healthchecks.io would; not added.
- **`[probe]` prefix for probe request logs.** Built twice for #223 (a child logger factory,
  then a Fastify `LogController`) to mark the ~55,000 daily request logs of health probes,
  `/metrics` scrapes and the heartbeat, then removed: the user did not want this code.

### Open points

- The heartbeat outage test above has not been run.
- What uses about 11 GiB on galkin was not measured; the read-only commands are in the worklog.

See [worklog](project-worklog.md).
