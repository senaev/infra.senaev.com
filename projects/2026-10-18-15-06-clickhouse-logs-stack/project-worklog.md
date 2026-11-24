## 2026-11-24 22:00 UTC — Verified log delivery from all seven nodes

The user chose to skip the production ClickHouse outage drill. Local testing already
verified persistent queue recovery. Grafana showed seven ready agents, a live 450-day
TTL and labeled logs from six nodes since the label fix. The user ran a temporary pod
on `proxmox` using the cached node exporter image. Grafana returned its test line with
the expected node, namespace and pod name. The probe exited and Kubernetes removed it.

```tsv
timestamp_utc	node	ns	pod	Body
2026-11-24 22:00:38.195797010	proxmox	telemetry	otel-log-probe-proxmox	otel-proxmox-verify-20261124
```

```text
pod "otel-log-probe-proxmox" deleted from telemetry namespace
```

## 2026-11-22 23:09 UTC — Verified node labels during the rollout

[PR #291](https://github.com/senaev/infra.senaev.com/pull/291/changes) set the node
label in the filelog receiver. Helm finished in about 50 seconds. All seven replacement
agents stayed ready with zero restarts and all five public smoke tests passed.
[Deployment](https://github.com/senaev/infra.senaev.com/actions/runs/45080662115)

On `senaev-media`, ClickHouse and Datadog matched all 86 records during the rollout and
all 271 in the following five minutes. Every ClickHouse record in both samples had its
node label. In the 23:02–23:07 UTC window, 9,946 ClickHouse rows and 9,631 Datadog rows
were counted on shared nodes. The difference was 300 terminal-control-only lines and a
net 15 rows with timestamps across the window boundaries. Agent working set averaged
327 MiB before the rollout and 310 MiB after it, summed across all seven nodes.

The rollout query (23:00–23:02 UTC) and the settled query (23:02–23:07 UTC) returned
these per-node counts. Both queries reported zero rows requiring a node-label fallback.

```text
… "senaev-media":{"ch":86,"dd":86,"controls":0,"streams":7} …
… "hetzner":{"ch":3378,"dd":3361,"controls":0,"streams":15} …
… "senaev-madrid":{"ch":6297,"dd":5999,"controls":300,"streams":13} …
… "senaev-media":{"ch":271,"dd":271,"controls":0,"streams":7} …
… "fallback":{} …
```

## 2026-11-22 22:20 UTC — Verified the smaller agents after image pulls

[PR #287](https://github.com/senaev/infra.senaev.com/pull/287/changes) switched the
agents to the OpenTelemetry Collector Kubernetes `0.165.0` build and added the startup
probe. Helm timed out with two of seven pods updated while `proxmox` was pulling its
image. The DaemonSet continued rolling out, and the retry passed after all agents became
ready. [Deployment](https://github.com/senaev/infra.senaev.com/actions/runs/45073349896/attempts/2)

The `senaev-media` agent replayed all 529 records emitted during its pull. They retained
pod and container names and lacked `k8s.node.name` at replay time. All 136 Xray messages
in that interval matched by message fingerprint. The total agent working set dropped
from 522 to 312 MiB in the five-minute samples.

The 21:55–22:08 UTC ClickHouse query and the Xray fingerprint comparison returned the
following. Datadog also counted 529 records across the same media pods.

```json
[{"records":529,"without_node":529}]
```

```tsv
records
529
```

```json
{"ch":136,"dd":136,"matched":136}
```

## 2026-11-22 21:35 UTC — Prepared the smaller node agent and startup probe

The user chose the OpenTelemetry Collector Kubernetes `0.165.0` image and normal
Kubernetes image pulls. The compressed Linux amd64 image dropped from about 110 MiB to
49 MiB. The startup probe checks port `13133` every five seconds and allows 24 failures.

The pinned binary validated the rendered configuration with synchronous log emission.
In the local upgrade test the new build resumed the Contrib agent's on-disk queue and
offsets and delivered 24 queued records and one new record to ClickHouse. All 25 records
were distinct. The fixture skipped Kubernetes API enrichment.
[PR checks](https://github.com/senaev/infra.senaev.com/actions/runs/45072700999)

On November 24 the local repeat forced the Contrib `0.165.0` agent to stop with the
gateway offline, then started the Kubernetes `0.165.0` agent on the same disk queue.
ClickHouse `26.8.43.13` returned all 24 queued records and one fresh record exactly once.

```tsv
total_records	distinct_records	queued_records	fresh_records
25	25	24	1
```

## 2026-11-22 21:08 UTC — Verified the cluster-wide rollout retry

The first [deployment attempt](https://github.com/senaev/infra.senaev.com/actions/runs/45066157360)
timed out. `firstvds` recovered from its liveness restarts. The `proxmox` agent started at
20:51:42 UTC. The user supplied pod status showing `senaev-media` ready with zero
restarts after its agent started at 20:58:40 UTC. The Hetzner replacement started at
20:58:43 UTC. [Attempt 2](https://github.com/senaev/infra.senaev.com/actions/runs/45066157360/attempts/2) succeeded at 21:05:50 UTC with seven agents ready.

```text
Tests  5 passed (5)
```

All 62 VictoriaMetrics scrape targets were up. Grafana passed both datasource health
checks, and the gateway reported zero receiver failures or refusals. The 21:00–21:02
UTC comparison matched all 90 Datadog records from `senaev-media` and all 1,199
Madrid log-generator records. Five media records crossed the time-window boundary
because the backends used different timestamps. During 20:58:20–21:00:20 UTC,
all 136 Hetzner `cluster-helper` records matched through the agent replacement.

The first rollout left 664 Datadog records from `senaev-media` missing from ClickHouse
in the 20:26–20:42 UTC sample. The `proxmox-madrid` agent has delivered logs.
Kubelet reported zero changes in log file size for the other `proxmox` pods in the
nine-minute verification window. A new `proxmox` log remains to be verified. PR #287
was held after `firstvds` recovered.

The historical queries returned the following counts on November 24. In the 21:00–21:02
UTC media sample, the backends returned 85 and 90 records. Padding that window by ten
seconds on both sides returned 113 records in each backend.

| UTC window on November 22 | Filter | ClickHouse `records` | Datadog `records` |
| --- | --- | ---: | ---: |
| 20:26–20:42 | `senaev-media` | 0 | 664 |
| 21:00–21:02 | `senaev-media` | 85 | 90 |
| 20:59:50–21:02:10 | `senaev-media` | 113 | 113 |
| 21:00–21:02 | Madrid log generator | 1199 | 1199 |
| 20:58:20–21:00:20 | Hetzner `cluster-helper` | 136 | 136 |

```text
ClickHouse: [{"records":0}]
Datadog TSV:
records
664
```

## 2026-11-22 18:03 UTC — Verified the deployed Hetzner pilot

PR #269 merged as `96ef7eef`. The first Helm attempt timed out after External Secrets
reported `cannot find secret data for key: "CLICKHOUSE_READER_PASSWORD"`. After the user
corrected the Vault record, the reader Secret was created at 17:58:56 UTC. ClickHouse
became ready and [deployment attempt 2](https://github.com/senaev/infra.senaev.com/actions/runs/45048887994/attempts/2) completed both releases.

```text
NAME: clickhouse-logs
STATUS: deployed
NAME: vm-stack
STATUS: deployed
TTL toDateTime(Timestamp) + toIntervalDay(450)
Tests  5 passed (5)
```

No restarts were reported for the pilot or Grafana containers. Grafana queried recent
ClickHouse rows and returned a cluster-helper `request completed` log from the
`senaev-com` namespace. The gateway counters showed 13,940 logs accepted and 13,932
exported, with 6,723 bytes queued and zero receiver failures or refusals. All 62 scrape
targets were up, and Datadog received fresh cluster-helper logs. At this stage the
production outage test was still open.

## 2026-11-22 17:08 UTC — Enabled synchronous log emission on the agent

The user confirmed both Vault password entries were added. The agent now passes `--feature-gates=stanza.synchronousLogEmitter` so filelog hands off each batch to the persistent exporter queue before advancing its checkpoint. Collector v0.165.0 accepted the rendered agent configuration.

A local CRI fixture queued 24 logs with the gateway offline. After a forced agent stop, the gateway came online and the restarted agent delivered the queued logs to ClickHouse.

```text
Recovered all 24 distinct fixture logs in ClickHouse after the abrupt agent restart.
```

## 2026-11-22 00:34 UTC — Set log retention to 450 days

The user set the pilot's retention to 450 days before the first deployment. ClickHouse accepted the rendered Helm schema on a fresh database and reported:

```text
TTL toDateTime(Timestamp) + toIntervalDay(450)
```

## 2026-11-21 20:48 UTC — Implemented the Hetzner pilot

The user chose `senaev-madrid` for ClickHouse and kept the gateway and persistent queue on Hetzner. The first DaemonSet agent is restricted to Hetzner. The ClickHouse server uses the OpenTelemetry Collector Contrib v0.165.0 table definition, adjusted for the 14-day TTL. Grafana uses the read-only account. The ClickHouse and OTLP services have ingress NetworkPolicies.

The rendered collector configuration was validated with the v0.165.0 binary. A local test with ClickHouse 26.8.43.13 ingested a CRI stdout fixture, rejected inserts by the Grafana account, and confirmed the table TTL. The gateway accepted logs and recovered its disk queue after a restart while ClickHouse was down.

```text
TTL toDateTime(Timestamp) + toIntervalDay(14)
Ingested CRI stdout log with agent and gateway
Recovered one copy of each test log after ClickHouse outage and gateway kill/restart
```

Production rollout awaits the Vault keys and PR merge. The local exercise used a CRI fixture and skipped Kubernetes API enrichment.
