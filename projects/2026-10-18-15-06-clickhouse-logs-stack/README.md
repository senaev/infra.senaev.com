# 2026-10-18 — Collect pod logs into ClickHouse in OTel format

- [ ] Collect container logs with OpenTelemetry and search them in Grafana alongside the existing Datadog collection.

## Goal

A node-local Collector reads Kubernetes container stdout and stderr and adds Kubernetes metadata. It sends logs over OTLP to the gateway on Hetzner. The gateway writes to `otel.otel_logs` in ClickHouse on `senaev-madrid`. The existing Grafana reads the table through the **ClickHouse Logs** data source in Explore. The log table has a 450-day TTL.

## Context

- The [Madrid migration](../2026-11-14-18-42-migrate-telemetry-to-madrid/README.md) established node-local storage under `/k3s-cluster/volumes`. The [logs chart](../../provisioning/helm/telemetry/clickhouse-logs/) uses that layout for ClickHouse, the gateway queue and the agent's queue and file offsets.
- Hetzner hosts the gateway, and the agent runs on every Linux node. The gateway can accept logs while Madrid is unavailable and retry when ClickHouse returns. Its queue holds up to 512 MiB of serialized batches. The amount of outage time this covers depends on the incoming log rate. Retries can produce duplicates.
- ClickHouse is a single instance. Its writer can insert and inspect column definitions. Grafana can read the logs table and set a query timeout up to 60 seconds.
- The collectors start with new lines and resume at saved offsets after restarts. They skip the pipeline's own logs to prevent exporter errors from feeding the queue.

## Plan

1. The Hetzner pilot was deployed and verified after both Vault password keys were in place. [Pilot deployment](https://github.com/senaev/infra.senaev.com/actions/runs/45048887994/attempts/2)
2. The cluster-wide rollout deployed one agent on each of the seven Linux nodes. [Deployment retry](https://github.com/senaev/infra.senaev.com/actions/runs/45066157360/attempts/2)
3. Review the smaller agent image and startup probe in [PR #287](https://github.com/senaev/infra.senaev.com/pull/287/changes). After rollout, verify agent readiness and recent logs on every node. Repeat the Datadog comparison on shared nodes.

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
- After the agent image update, check the DaemonSet rollout and pod restart counts. Compare the same time window and workloads in ClickHouse and Datadog on the nodes both collect from.
- For the recovery test, temporarily scale only `deployment/clickhouse-logs` to zero, then let a Hetzner pod emit a distinctive log line. Verify that `otelcol_exporter_queue_size{exporter="clickhouse"}` rises in VictoriaMetrics. Restore one replica with `kubectl -n telemetry scale deployment/clickhouse-logs --replicas=1`, wait for readiness, and find the line in Grafana as the queue drains.
- Confirm Datadog still receives the Hetzner pod's logs and that Grafana's VictoriaMetrics data source still returns a fresh `up` sample.

## Result

The pilot and all-node rollout are deployed. Helm reached its five-minute timeout on the first all-node deployment, and the retry succeeded after the agents became ready.

PR #287 switches the node agents to OpenTelemetry Collector Kubernetes `0.165.0` and gives them about two minutes to pass the startup probe before liveness checks begin. The image is about 49 MiB compressed on Linux amd64, down from 110 MiB. Kubernetes pulls it during normal pod startup. Local testing delivered all 24 records queued by the previous agent and one new record to ClickHouse, each once. The rollout and cluster verification for this update are pending. See the [worklog](project-worklog.md).
