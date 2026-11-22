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

1. The Hetzner pilot was deployed and verified after both Vault password keys were in place. [Pilot deployment](https://github.com/senaev/infra.senaev.com/actions/runs/45048887994/attempts/2)
2. Merge the cluster-wide rollout. CI upgrades the `clickhouse-logs` release and deploys one agent on every Linux node.
3. Verify that every node contributes logs. Compare ClickHouse with Datadog on their shared nodes.

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
- For the recovery test, temporarily scale only `deployment/clickhouse-logs` to zero, then let a Hetzner pod emit a distinctive log line. Verify that `otelcol_exporter_queue_size{exporter="clickhouse"}` rises in VictoriaMetrics. Restore one replica with `kubectl -n telemetry scale deployment/clickhouse-logs --replicas=1`, wait for readiness, and find the line in Grafana as the queue drains.
- Confirm Datadog still receives the Hetzner pod's logs and that Grafana's VictoriaMetrics data source still returns a fresh `up` sample.

## Result

The pilot is implemented. Production ingestion, the Grafana Explore query, queue recovery in the cluster, and rollout beyond Hetzner are pending. See the [worklog](project-worklog.md).
