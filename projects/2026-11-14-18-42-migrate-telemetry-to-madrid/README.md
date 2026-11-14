# 2026-11-14 — Migrate telemetry from Hetzner to senaev-madrid

Move Grafana, the VictoriaMetrics stack and associated telemetry data to Madrid, preserving history and providing a tested rollback.

## Goal

Relocate central telemetry services and persistent state from Hetzner to `senaev-madrid`, the worker VM on `proxmox-madrid`. Preserve metrics history, Grafana dashboards, users, datasource identities, alerting configuration and other persisted state. Prevent avoidable collection gaps and document remaining outage risks.

**Status: implementation prepared; no migration or deployment has started.**

**Do not merge until steps 1–6 of the [migration runbook](migration.md) are complete.** Main auto-deploys placement changes; node-local PVCs require a separate stopped-data transfer and replacement binding.

## Context

Source configuration at baseline `d269c50f` (desired state, not live inventory). This PR changes central placement to Madrid:

| Component | Current configuration | Scope |
| --- | --- | --- |
| Grafana | `vps: hetzner`, 1Gi persistent volume, SQLite | Application, complete data volume, configuration and secret dependencies |
| VMSingle | `vps: hetzner`, retentionPeriod `3` | Service and full metrics history; discover actual volume/path |
| vmagent | `vps: hetzner`, 30s scrapes, no explicit persistent queue volume in wrapper values | Collector handover and durable buffering |
| VMAlert / Alertmanager | `vps: hetzner`, Telegram via cluster-helper | Evaluation, routing and persisted state if present |
| VM operator | Separate chart, `vps: hetzner` | Move to Madrid; prepatch CR placement while stopped before merge |
| Grafana MCP | `senaev-com`, `vps: hetzner` | Move stateless bridge to Madrid |
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

1. **Inventory and baseline.** Capture actual pods, volume bindings/paths, capacities, versions, Grafana state and fixed historical query results. Discover any log/trace data outside the defined stack before proceeding.
2. **Review the maintenance window.** This implementation uses stopped-writer copying and has a scraping/evaluation interruption. If zero-gap collection is required, first add/test an independent durable collector. Verify capacity, backups, ingress connectivity and recovery access.
3. **Generate the volume plan.** Explicitly select every actual persistent telemetry claim. Review new Retain Madrid PVs, same-name replacement claims and rollback claims. Existing source PVs stay intact.
4. **Stop, back up and transfer.** Freeze deployment/reconciliation, retain source PVs, check StatefulSet claim-retention policies, gracefully stop vmagent while storage is healthy, then stop remaining writers. Independently back up complete directories, copy and checksum them on Madrid.
5. **Prepare bindings before merge.** Replace selected claim objects against precreated Madrid PVs. Prepatch stack CR placement while the operator is stopped: CI deploys vm-operator before vm-stack, so it must not reconcile old Hetzner placement against Madrid volumes.
6. **Deploy and verify.** Merge only after the runbook checkpoint. Follow deployment, confirm Madrid placement and historical/current data, Grafana/MCP access and Telegram alerts. Record gaps and restore ephemeral silences as applicable.
7. **Observe and close out.** Observe at least 24 hours, test recovery/restarts, add static target volumes to backups/alerts, and document final paths. Source cleanup is a separately authorized action.

### Rollback

Keep source volumes, configuration and independent backups throughout acceptance. Define service/ingress switch-back and collector routing before cutover. After Madrid accepts samples or Grafana edits, the old copy is stale: preserve/reconcile new writes before rollback or explicitly record the resulting loss. Avoid duplicate alert evaluators and Grafana writers. Do not delete or rebind production PVCs as an improvised recovery step.

### Execution boundaries

Use reviewable implementation pull requests. This PR changes placement values and provides an offline volume-plan generator and runbook. It performs no automatic data transfer or deletion. Follow repository safeguards for Madrid connectivity; do not incidentally alter Tailscale, routes or firewall. Provide exact cluster-changing commands and rollback commands for the user to execute under the repository workflow.

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

Prepared Madrid placement for Grafana, VMSingle, vmagent, vmalert, Alertmanager, kube-state-metrics, iperf scheduler, VM operator and Grafana MCP. Added [migration runbook](migration.md) and [offline volume-plan generator](../../scripts/telemetry_volume_plan.py). Distributed collection stays on source nodes. Live inventory, transfer and deployment remain pending. The stopped-collector procedure has a documented scraping interruption.

See [project worklog](project-worklog.md).
