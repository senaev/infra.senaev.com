# 2026-10-18 — Collect pod logs into ClickHouse in OTel format

- [ ] Collect all container logs with OpenTelemetry Collectors, keep them in our own ClickHouse in the standard OTel format, and view them in the existing Grafana

## Goal

Our own log storage in the cluster, next to Datadog (Datadog does not change). The UI
(SigNoz, HyperDX) and the ChatGPT MCP tools are out of scope.

Data path: OTel agent (DaemonSet) → OTLP → OTel gateway → ClickHouse `otel.otel_logs` → Grafana.

## Context

- Grafana: the `grafana` subchart of `victoria-metrics-k8s-stack` 0.72.2 in
  `provisioning/helm/vm-stack/values.yaml`, `telemetry` namespace. Extra datasources go to
  `defaultDatasources.extra` and are rendered into a ConfigMap. Do not put passwords there.
- Chart pattern: a wrapper chart with a vendored `.tgz` in `charts/` (see `vm-operator`),
  deployed by `upgrade-namespace.sh <chart> <namespace>` and by `update-helm-charts.yml`.
- Secrets: Vault `senaev-com-kv` → External Secrets → `senaev-com-kv-secrets`.
- Pods are pinned with `nodeSelector: vps: <node>`. On `senaev-media`, data lives on a
  `hostPath` under `mediaServerStoragePath` (`/mnt/sdb1`, `provisioning/helm/common-values.yaml`),
  for example `/mnt/sdb1/volumes/minio`.
- `senaev-media` is a sensitive home node (see root `AGENTS.md`): no host network, roll out
  to it last, and ask the user first.

## Plan

1. **Capacity check on `senaev-media`** (read-only): `kubectl top nodes`, `free -h`,
   `df -h /mnt/sdb1`. Retention: 14 days.
2. **ClickHouse on `senaev-media`**: 1 shard, 1 replica, `MergeTree`, no Keeper,
   `nodeSelector: vps: senaev-media`, data on `hostPath` `/mnt/sdb1/volumes/clickhouse`,
   in-cluster access only. Set memory limits, so ClickHouse cannot starve the media services.
   Ask the user before the first deploy (sensitive node).
   ❓ Install with the Altinity `clickhouse-operator` (vendored chart + `ClickHouseInstallation`)?
   Users:
   - `otel_writer`: `CREATE` and `INSERT` on the `otel` database only
   - `reader`: `readonly=1`, with limits on query time and result rows, and
     `max_execution_time CHANGEABLE_IN_READONLY` (the Grafana plugin sets it on every query)
3. **OTel gateway**: chart `opentelemetry-collector` 0.176.0
   (https://open-telemetry.github.io/opentelemetry-helm-charts), `mode: deployment`,
   1 replica, image `otel/opentelemetry-collector-contrib`, pinned to `hetzner`.
   - receiver `otlp` (gRPC), cluster-internal Service
   - exporter `clickhouse`: `database: otel`, `ttl: 336h`, `create_schema: true`, user `otel_writer`
   - `sending_queue.batch` (`min_size: 5000`, `flush_timeout: 5s`) instead of the `batch` processor
   - `sending_queue.storage` with `file_storage` on a small PVC. The gateway stays on
     `hetzner`, so it buffers logs while the home link to `senaev-media` is down. Size the
     queue and `retry_on_failure.max_elapsed_time` for an outage of at least 1 hour.
4. **OTel agent**: the same chart, a second release, `mode: daemonset`.
   - `presets.logsCollection` and `presets.kubernetesAttributes`
   - exporter `otlp` to the gateway
   - no host network, no metrics; set resource requests/limits
   - rollout: `hetzner` → `firstvds` → `senaev-media` (ask first)
5. **Grafana**, in `provisioning/helm/vm-stack/values.yaml`:
   - `grafana.plugins: [grafana-clickhouse-datasource]`
   - `grafana.envValueFrom.CLICKHOUSE_READER_PASSWORD` from `senaev-com-kv-secrets`
   - in `defaultDatasources.extra`:
     ```yaml
     - name: ClickHouse Logs
       type: grafana-clickhouse-datasource
       jsonData:
         host: <clickhouse-service>.<namespace>.svc.cluster.local
         port: 9000
         protocol: native
         username: reader
         defaultDatabase: otel
         logs:
           defaultDatabase: otel
           defaultTable: otel_logs
           otelEnabled: true
       secureJsonData:
         password: $CLICKHOUSE_READER_PASSWORD
     ```
6. **Secrets**: put the `otel_writer` and `reader` passwords in Vault.
7. **CI**: the new charts are in the `update-helm-charts.yml` matrix; `npm run check:helm` passes.
8. **Optional**: `vmagent` scrapes the ClickHouse and collector metrics, and a vmalert rule
   sends a Telegram alert on high ClickHouse disk usage or exporter send failures.

## Verification

- Logs from every node with an agent arrive within one minute:
  `SELECT ResourceAttributes['k8s.node.name'] AS node, count(), max(Timestamp) FROM otel.otel_logs WHERE Timestamp > now() - INTERVAL 5 MINUTE GROUP BY node`
- Grafana: the datasource test passes. In Explore, logs show the level and the body, filter
  by `k8s.namespace.name` and `k8s.pod.name`, and text search finds a known log line.
- The log count for one pod and one hour is the same as in Datadog.
- A restart of the agent or the gateway gives no gap and no duplicate log lines.
- ClickHouse scaled to 0 for 10 minutes, then back: the gateway sends the queued logs, no gap.
- `reader` cannot run `INSERT` or `CREATE`.
- After 14 days, old logs are removed and disk usage stays flat.
- `senaev-media` stays reachable (`tailscale status` shows `direct`, SSH works).

## Findings

### 2026-10-18 — Decisions

ClickHouse with the standard OTel `clickhouseexporter` schema, so the data does not depend
on one UI. Logs only: metrics stay in VictoriaMetrics. Grafana is the first way to view
the logs.

### 2026-10-19 — ClickHouse on `senaev-media`

ClickHouse lives on `senaev-media`, with data on `/mnt/sdb1`. The gateway stays on
`hetzner` with a persistent queue, because the home link is less reliable.
