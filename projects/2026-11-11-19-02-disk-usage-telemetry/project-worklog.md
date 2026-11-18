# Worklog

## 2026-11-18 19:45 UTC — Project closed

The user closed the project after #223. Done: #220–#223. Not done, by the user's decision: the
disk usage collector, an early "filling up" alert, a node-exporter-down alert, worktree cleanup,
an external watcher for an outage of hetzner, and the `[probe]` log prefix. The heartbeat outage
test (Alertmanager scaled to 0 for ~6 minutes) is left to the user. See the README Result.

The deploy run of #223 stopped at the build on purpose, because `main` had already moved to
#224 (`test "$current" = "$GITHUB_SHA"`); the #224 run planned from the last successful deploy
and shipped it: `build (cluster-helper)`, `deploy (senaev-com)` and
`deploy (telemetry/vm-stack)` succeeded. Heartbeats in the cluster-helper logs afterwards:

```
2026-11-18T19:44:00Z  ✅ Alerting heartbeat monitor started
2026-11-18T19:44:00Z  incoming request  /alertmanager/heartbeat
2026-11-18T19:46:00Z  incoming request  /alertmanager/heartbeat
2026-11-18T19:47:00Z  incoming request  /alertmanager/heartbeat
```

`ALERTS{alertname="alerting-heartbeat"}` is firing, and no `Alerting is down` was sent.

## 2026-11-18 19:30 UTC — Alerting heartbeat merged (#223), `[probe]` logs dropped

Merged as `cb34db5f`. The heartbeat rule fires while node-exporter samples are fresh;
Alertmanager sends it every minute to cluster-helper on hetzner, which posts
`🚨 Alerting is down` after 5 minutes without one and `✅ Alerting recovered` when it returns.
Why: everything that evaluates and routes alerts runs on senaev-madrid:

```
kube_pod_info{node="senaev-madrid"}: vmagent, vmsingle, vmalert, vmalertmanager,
kube-state-metrics, grafana, vm-operator, ...
kube_pod_info{pod=~"cluster-helper.*"}: node="hetzner"
```

The heartbeat query on live data (one fresh `up` per node):

```
count(time() - tlast_over_time(up{job="node-exporter"}[5m]) < 120) > 0  =>  7
```

CodeRabbit found two state bugs (a heartbeat during the "down" send was lost; a failed
"recovered" send was never retried); the monitor now reconciles what the chat was told with the
heartbeat state on every check and heartbeat. On the user's request the monitor takes only
`notify`, hardcodes the clock, timeout and interval, and the tests use fake timers.

A `[probe]` prefix for the request logs of probes, scrapes and the heartbeat was built as a
child logger factory, then as a Fastify `LogController`, and removed: the user did not want
code about log messages. The routes it would have marked, from Datadog, last 24 hours:

```
cluster-helper  /health/ready  17280
cluster-helper  /health/live   17274
code-tools      /health        17274
obsidian-sync   /metrics        2879
```

## 2026-11-18 18:35 UTC — Threshold set to the k3s eviction threshold (#222)

The user asked for 2 GiB, then for the k3s rule. k3s evicts pods below 5% free
(`pkg/daemons/agent/agent.go`); our install scripts pass no kubelet flags:

```
EvictionHard: map[string]string{
    "imagefs.available": "5%",
    "nodefs.available":  "5%",
},
```

The rule is now `avail / size < 0.05` on `/` only, because senaev-media `/mnt/sdb1` is kept at
95–98% used by media-server-helper (`percentTriggerToRemove: 98`) and had 3.98% free at its
lowest this month. The user declined 10% (earlier warning). After the deploy vmalert reports
the rule `state: normal` and galkin (25% free) no longer matches.

## 2026-11-18 18:00 UTC — galkin disk use checked from metrics only

galkin's root disk has stayed at 10.8–11.1 GiB used of 14.7 GiB since it joined, so it is a
fixed footprint, not growth. The omp-web image is 689 MiB compressed. kubelet on k3s reports no
per-pod disk use, so the breakdown needs these read-only commands on the node (not run):

```
du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15
du -sh /var/lib/rancher/k3s/agent/containerd /var/lib/rancher/k3s/storage /k3s-cluster 2>/dev/null
crictl images; journalctl --disk-usage
```

The galkin workspace declares 3 × 8Gi volumes on this disk (`local-path`, not enforced).

## 2026-11-18 17:55 UTC — VPS name and readable alerts deployed (#220, #221)

A `node` label from `__meta_kubernetes_pod_node_name` on the node-exporter scrape:

```
count by (node) (node_filesystem_avail_bytes{job="node-exporter"})
firstvds 8, galkin 3, hetzner 8, proxmox 10, proxmox-madrid 9, senaev-madrid 7, senaev-media 11
```

The Telegram message had all fields on one line because Telegram Markdown joins plain
newlines; lines now end with a hard break. Missing `pod`/`job`/`instance` labels no longer throw.
After the deploy Datadog showed `👉 Processing alert` at level `emergency`: the field `status:
firing` was read as the log level, so #221 renamed it to `alertStatus`.

## 2026-11-18 17:00 UTC — Plan challenged before any implementation

Live data at the start: `node-disk-space-low` was firing for galkin every day with a flat
3.7 GiB free, while senaev-media lost ~6 GiB in 30 days and hetzner swung by up to ~15 GiB
without an alert. The stock `node-exporter` rule group (26 rules, incl.
`NodeFilesystemSpaceFillingUp`) was evaluated but had no `route` label, so it went to the
blackhole receiver. Decision with the user: fix the alert first (VPS name, message, threshold);
leave the hourly collector.

## 2026-11-11 21:11 UTC — Split from the Code Tools plan

The plan came from the Obsidian vault file `projects/2026-11-11-19-02-code-tools-worktrees-disk-telemetry.md`, together with the Code Tools change. It is a separate project now, because it is not related to Code Tools and has its own risks and PR. No implementation or measurement has started.
