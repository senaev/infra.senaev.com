# 2026-11-14 — Migrate telemetry from Hetzner to senaev-madrid

Move Grafana, the VictoriaMetrics stack and associated telemetry data to Madrid, preserving history and providing a tested rollback.

## Goal

Relocate central telemetry services and persistent state from Hetzner to `senaev-madrid`, the worker VM on `proxmox-madrid`. Preserve metrics history, Grafana dashboards, users, datasource identities, alerting configuration and other persisted state. Prevent avoidable collection gaps and document remaining outage risks.

Status: planning only. No migration or deployment has started.

## Context

Repository configuration at baseline `d269c50f` (desired state, not live inventory):

| Component | Current configuration | Scope |
| --- | --- | --- |
| Grafana | `vps: hetzner`, 1Gi persistent volume, SQLite | Application, complete data volume, configuration and secret dependencies |
| VMSingle | `vps: hetzner`, retentionPeriod `3` | Service and full metrics history; discover actual volume/path |
| vmagent | `vps: hetzner`, 30s scrapes, no explicit persistent queue volume in wrapper values | Collector handover and durable buffering |
| VMAlert / Alertmanager | `vps: hetzner`, Telegram via cluster-helper | Evaluation, routing and persisted state if present |
| VM operator | Separate chart, `vps: hetzner` | Move after managed workloads stabilize |
| kube-state-metrics / iperf scheduler | `vps: hetzner` | Central helpers; preserve probe coverage and measurement meaning |
| Node exporters / distributed probes | Distributed by node | Keep node-local collection and probe endpoints on their respective nodes |
| Logs / traces | No dedicated backend chart found under telemetry | Inventory actual deployment; do not assume VictoriaLogs or Loki exists |

Sources:
- [VM stack values](../../provisioning/helm/telemetry/vm-stack/values.yaml)
- [VM operator values](../../provisioning/helm/telemetry/vm-operator/values.yaml)
- [Telemetry templates](../../provisioning/helm/telemetry/vm-stack/templates/)
- [Grafana MCP configuration](../../provisioning/helm/senaev-com/values.yaml)
- [Madrid host variables](../../terraform/variables.tf)
- [Earlier ClickHouse logging proposal](../2026-10-18-15-06-clickhouse-logs-stack/README.md), which is not evidence of deployed storage.

Public Grafana, VictoriaMetrics and alerting ingress currently uses `traefik-hetzner`. Datadog is external: preserve its coverage; its backend data does not need copying between hosts. Moving telemetry does not move the K3s control plane off Hetzner or remove that dependency.

## Plan

1. **Inventory read-only.** Record live workloads, versions, rendered resources, PVC/PV bindings, node affinity, reclaim policies, volume paths, used bytes, retention and ingress dependencies. Identify all existing log/trace backends and collector queues. Verify Madrid CPU/RAM/disk capacity, connectivity, VM autostart, backups and recovery access. Confirm `senaev-madrid` as the intended destination before execution.
2. **Define outage tolerance.** Measure data size and transfer throughput; choose collection-gap targets. Size queues from ingestion rate × outage duration plus margin. Document Madrid power/internet/disk failures and Hetzner control-plane dependence. Keep node-local collection distributed; explicitly decide whether an independent collector outside Madrid should buffer during Madrid outages.
3. **Make collection and backups durable.** Inspect vmagent queue settings and persistent mounts; test backend-unavailable buffering, replay and pod replacement before relying on them. For actual log collectors, inspect retry limits, disk queues, source rotation and read-position persistence. Back up Grafana state and encryption-secret dependencies, metrics, and any existing logs/traces. Prove restoration into isolated storage with no production scraping or duplicate alerts.
4. **Prepare target volumes and manifests.** Provision distinct Madrid volumes with correct ownership, capacity and affinity. Changing a nodeSelector does not move a node-local PV. Preserve source volumes and backups. Prefer stable release/service names, namespace, datasource UIDs, secret references, public URLs and Grafana MCP access. Determine whether Hetzner ingress can route to Madrid before changing DNS or ingress class.
5. **Transfer in stages.** Keep software versions unchanged during migration. Choose a supported consistent snapshot/restore with explicit handling of all writes after the snapshot, or controlled stop-and-copy while an independent vmagent queues samples. Never use an ordinary copy of an actively written database as the final authoritative copy. Grafana SQLite and auxiliary files require a consistent backup or stopped writer. Never run two writers against one volume. Move storage, Grafana, alerting and helpers in separately verifiable steps; move the operator last. Handle scraper handover separately: scraper downtime creates uncollected samples even when storage migration is safe.
6. **Verify and observe.** Compare fixed historical queries, current ingestion, queue drain, Grafana state, MCP access, alerts and all-node coverage. Compare known messages and bounded log/trace counts if those systems exist. Observe at least 24 hours and test pod replacement and a planned Madrid VM restart before considering cleanup.
7. **Close out.** Record actual commands, evidence, gaps, final data paths and backup/restore instructions. Remove obsolete Hetzner workloads and source data only after acceptance and explicit cleanup authorization.

### Rollback

Keep source volumes, configuration and independent backups throughout acceptance. Define service/ingress switch-back and collector routing before cutover. After Madrid accepts samples or Grafana edits, the old copy is stale: preserve/reconcile new writes before rollback or explicitly record the resulting loss. Avoid duplicate alert evaluators and Grafana writers. Do not delete or rebind production PVCs as an improvised recovery step.

### Execution boundaries

Use reviewable implementation pull requests. This project changes documentation only. Follow repository safeguards for Madrid connectivity; do not incidentally alter Tailscale, routes or firewall. Provide exact cluster-changing commands and rollback commands for the user to execute under the repository workflow.

## Verification

- Existing Grafana URL works; dashboards, users, datasource UIDs, alerts and service-account access survive.
- Grafana MCP lists dashboards and queries historical and current metrics.
- Fixed historical queries match baseline results; fresh samples arrive from all previous targets. Explain unexpected `up == 0` series.
- Queues drain after recovery; measure overflow, dropped data and collector restart behavior.
- A controlled Telegram alert fires and resolves without duplicate notifications.
- Existing logs/traces, if discovered, remain queryable; measure gaps and delivery delay.
- Services mount Madrid volumes; pod replacement and a planned VM restart retain state and restore ingestion.
- Run `npm run test:smoke` after deployment and inspect Grafana/Datadog health and scoped errors.
- Record a tested restore/rollback procedure; retain backups until acceptance.

## Result

Project initialized on `telemetry-madrid-migration`. Repository naming identifies the target as `senaev-madrid`. Live inventory, implementation, transfer and deployment remain pending.

See [project worklog](project-worklog.md).
