# 2026-10-18 — Collect pod logs into ClickHouse in OTel format

Collect container logs with OpenTelemetry and search them in Grafana alongside the existing Datadog collection.

## Goal

A node-local Collector reads Kubernetes container stdout and stderr and adds Kubernetes metadata. It sends logs over OTLP to the gateway on Hetzner. The gateway writes to `otel.otel_logs` in ClickHouse on `senaev-madrid`. The existing Grafana reads the table through the **ClickHouse Logs** data source in Explore. The log table has a 450-day TTL.

## Context

- The [Madrid migration](../2026-11-14-18-42-migrate-telemetry-to-madrid/README.md) established node-local storage under `/k3s-cluster/volumes`. The [logs chart](../../provisioning/helm/telemetry/clickhouse-logs/) uses that layout for ClickHouse, the gateway queue and the agent's queue and file offsets.
- Hetzner hosts the gateway and the first agent. The gateway can accept logs while Madrid is unavailable and retry when ClickHouse returns. Its queue holds up to 512 MiB of serialized batches. The amount of outage time this covers depends on the incoming log rate. Retries can produce duplicates.
- ClickHouse is a single instance. Its writer can insert and inspect column definitions. Grafana can read the logs table and set a query timeout up to 60 seconds.
- The collectors start with new lines and resume at saved offsets after restarts. They skip the pipeline's own logs to prevent exporter errors from feeding the queue.

## Plan

1. Add `CLICKHOUSE_WRITER_PASSWORD` and `CLICKHOUSE_READER_PASSWORD` to the existing Vault `kv/senaev-com-kv` record as two independent random secrets. The [Vault editor](https://vault.senaev.com/ui/vault/secrets/kv/kv/senaev-com-kv/details/edit) and `vault kv patch kv/senaev-com-kv` both support preserving the existing keys.
2. Merge the pilot once the Vault keys are in place. CI deploys the `clickhouse-logs` and `vm-stack` releases in `telemetry`. External Secrets creates `clickhouse-logs-writer` and `clickhouse-logs-reader`.
3. Verify the Hetzner pilot, then expand the agent's node selection in stages.

## Verification

- Confirm both ExternalSecrets are ready and the three workloads are running on their intended nodes. Run these in the personal-cluster terminal.
  ```sh
  kubectl -n telemetry wait --for=condition=Ready externalsecret/clickhouse-logs-writer externalsecret/clickhouse-logs-reader --timeout=60s
  kubectl -n telemetry get pods -o wide -l 'app in (clickhouse-logs,otel-logs-gateway,otel-logs-agent)'
  ```
- Find a fresh line from a known Hetzner pod in Grafana Explore. Filter by its namespace and pod name, then search for part of the line. Run the query below in SQL mode to check the source node and timestamp.
  ```sql
  SELECT
      ResourceAttributes['k8s.node.name'] AS node,
      count() AS records,
      max(Timestamp) AS latest
  FROM otel.otel_logs
  WHERE Timestamp > now() - INTERVAL 5 MINUTE
  GROUP BY node
  ```
- For the recovery test, temporarily scale only `deployment/clickhouse-logs` to zero, then let a Hetzner pod emit a distinctive log line. Verify that `otelcol_exporter_queue_size{exporter="clickhouse"}` rises in VictoriaMetrics. Restore one replica with `kubectl -n telemetry scale deployment/clickhouse-logs --replicas=1`, wait for readiness, and find the line in Grafana as the queue drains.
- Confirm Datadog still receives the Hetzner pod's logs and that Grafana's VictoriaMetrics data source still returns a fresh `up` sample.

## Result

The Hetzner pilot is deployed and serving logs. The first attempt waited for the reader
credential and timed out. External Secrets synced the key after the Vault record was
corrected, and [deployment attempt 2](https://github.com/senaev/infra.senaev.com/actions/runs/45048887994/attempts/2) succeeded.

ClickHouse and Grafana were ready on `senaev-madrid`. The agent and gateway were ready on
Hetzner. Grafana queried a fresh cluster-helper log and returned 1,606 Hetzner records
from a five-minute window. The live table has a 450-day TTL. All 62 scrape targets were
up, Datadog received fresh cluster-helper logs, and five public smoke checks passed.

The controlled ClickHouse outage test and collection beyond Hetzner are pending.
See the [worklog](project-worklog.md).
