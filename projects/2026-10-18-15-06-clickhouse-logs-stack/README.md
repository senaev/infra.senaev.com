# 2026-10-18 — Collect pod logs into ClickHouse in OTel format

- [x] Collect container logs with OpenTelemetry and search them in Grafana alongside the existing Datadog collection.

## Goal

A node-local Collector reads Kubernetes container stdout and stderr and adds Kubernetes metadata. It sends logs over OTLP to the gateway on Hetzner. The gateway writes to `otel.otel_logs` in ClickHouse on `senaev-madrid`. The existing Grafana reads the table through the **ClickHouse Logs** data source in Explore. The log table has a 450-day TTL.

## Context

- The [Madrid migration](../2026-11-14-18-42-migrate-telemetry-to-madrid/README.md) established node-local storage under `/k3s-cluster/volumes`. The [logs chart](../../provisioning/helm/telemetry/clickhouse-logs/) uses that layout for ClickHouse, the gateway queue and the agent's queue and file offsets.
- Hetzner hosts the gateway, and the agent runs on all seven Linux nodes. The gateway can accept logs while Madrid is unavailable and retry when ClickHouse returns. Its queue holds up to 512 MiB of serialized batches. The amount of outage time this covers depends on the incoming log rate. Retries can produce duplicates.
- ClickHouse is a single instance. Its writer can insert and inspect column definitions. Grafana can read the logs table and set a query timeout up to 60 seconds.
- The collectors start with new lines and resume at saved offsets after restarts. They skip the pipeline's own logs to prevent exporter errors from feeding the queue.

## Plan

1. Deploy the pilot on Hetzner and expand the agent to all Linux nodes.
2. Roll out the smaller agent with a startup probe and set the node label as the agent reads each log.
3. Verify delivery from all seven nodes and compare ClickHouse with Datadog on their shared nodes.

## Verification

- Confirm both ExternalSecrets are ready and the three workloads are running on their intended nodes. Run these in the personal-cluster terminal.
  ```sh
  kubectl -n telemetry wait --for=condition=Ready externalsecret/clickhouse-logs-writer externalsecret/clickhouse-logs-reader --timeout=60s
  kubectl -n telemetry get pods -o wide -l 'app in (clickhouse-logs,otel-logs-gateway,otel-logs-agent)'
  ```
- Use the SQL query below to check for recent logs from each node. If a node is quiet, emit a distinctive line from a pod on that node and find it in Grafana Explore by filtering on the namespace and pod name.
  ```sql
  SELECT
      ResourceAttributes['k8s.node.name'] AS node,
      count() AS records,
      max(Timestamp) AS latest
  FROM otel.otel_logs
  WHERE Timestamp > now() - INTERVAL 5 MINUTE
  GROUP BY node
  ```
- Confirm Datadog still receives the Hetzner pod's logs and that Grafana's VictoriaMetrics data source still returns a fresh `up` sample.

## Result

The Hetzner pilot is deployed and serving logs. The first attempt waited for the reader
credential and timed out. External Secrets synced the key after the Vault record was
corrected, and [deployment attempt 2](https://github.com/senaev/infra.senaev.com/actions/runs/45048887994/attempts/2) succeeded.

ClickHouse and Grafana were ready on `senaev-madrid`. The agent and gateway were ready on
Hetzner. Grafana queried a fresh cluster-helper log and returned 1,606 Hetzner records
from a five-minute window. The live table has a 450-day TTL. All 62 scrape targets were
up, Datadog received fresh cluster-helper logs, and five public smoke checks passed.

### Cluster-wide rollout

PR #286 deployed the agent to all seven nodes. The first Helm attempt timed out during
startup. The agents recovered, and [attempt 2](https://github.com/senaev/infra.senaev.com/actions/runs/45066157360/attempts/2) succeeded with seven agents
ready.

The first rollout left 664 records from `senaev-media` in Datadog only, from the period
before its ClickHouse agent began collecting. The recovery samples then matched 90
records from `senaev-media`, 1,199 Madrid log-generator records and 136 Hetzner
`cluster-helper` records. See the [worklog](project-worklog.md).

PR #287 switched the agents to OpenTelemetry Collector Kubernetes `0.165.0` and added
a two-minute startup probe. The compressed Linux amd64 image went from about 110 MiB to
49 MiB. The retry succeeded after the image pulls finished and all seven agents became
ready. [Deployment](https://github.com/senaev/infra.senaev.com/actions/runs/45073349896/attempts/2)

PR #291 set `k8s.node.name` from the node name Kubernetes supplies to each agent.
Helm finished on the first attempt and all seven agents stayed ready with zero restarts.
On `senaev-media`, 86 records during the rollout and 271 afterward matched Datadog, with
a node label on every ClickHouse record. The earlier 529 replayed records remain searchable
by pod. The five-minute comparison across the three shared nodes accounted for the count
difference with 300 terminal-control-only records and timestamp boundaries.
[Deployment](https://github.com/senaev/infra.senaev.com/actions/runs/45080662115)

ClickHouse has received labeled logs from all seven nodes. On November 24 at 22:00 UTC,
Grafana returned the test line from `telemetry/otel-log-probe-proxmox` with
`k8s.node.name=proxmox`. Local testing verified persistent queue recovery, and the user
skipped the production outage drill. See the [worklog](project-worklog.md).
