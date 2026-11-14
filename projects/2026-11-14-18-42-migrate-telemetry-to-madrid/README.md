# 2026-11-14 — Migrate telemetry from Hetzner to senaev-madrid

Move Grafana, the VictoriaMetrics stack and associated telemetry data to Madrid, preserving history and documenting rollback.

## Goal

Relocate central telemetry services and persistent state from Hetzner to `senaev-madrid`, the worker VM on `proxmox-madrid`. Preserve metrics history, Grafana dashboards, users, datasource identities, alerting configuration and other persisted state. Prevent avoidable collection gaps and document remaining outage risks.

**Status: implementation prepared; no migration or deployment has started.**

**Do not merge until steps 1–4 of the [migration runbook](migration.md) are complete.** Main auto-deploys placement changes; node-local PVCs require a separate stopped-data transfer and replacement binding.

## Context

Source configuration at baseline `d269c50f` (desired state, not live inventory). This PR changes central placement to Madrid:

| Component | Current configuration | Scope |
| --- | --- | --- |
| Grafana | `vps: hetzner`, 1Gi persistent volume, SQLite | Application, complete data volume, configuration and secret dependencies |
| VMSingle | `vps: hetzner`, retentionPeriod `3` | Service and full metrics history; discover actual volume/path |
| vmagent | `vps: hetzner`, 30s scrapes, no explicit persistent queue volume in wrapper values | Move collector; accept a scraping interruption |
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

1. **Inventory.** Identify data directories, PVC/PV bindings, versions and central workloads. Save configuration and confirm Madrid disk space.
2. **Disable temporarily.** Pause deployments and the VM operator, stop vmagent gracefully while storage is available, then stop remaining central services. Keep original volumes/data.
3. **Copy manually.** Copy complete stopped directories to Madrid with numeric ownership preserved; checksum copies. Keep software versions and Grafana secrets unchanged.
4. **Attach copies.** Manually create replacement Madrid PVs and recreate original claim names against them. Prepare Madrid CR selectors with operator stopped, before merge.
5. **Enable and check.** Merge placement changes, follow deployment, check history, fresh metrics, Grafana and alerts. Keep Hetzner data until accepted.

### Rollback

Keep source volumes, configuration and independent backups throughout acceptance. Define service/ingress switch-back and collector routing before cutover. After Madrid accepts samples or Grafana edits, the old copy is stale: preserve/reconcile new writes before rollback or explicitly record the resulting loss. Avoid duplicate alert evaluators and Grafana writers. Do not delete or rebind production PVCs as an improvised recovery step.

### Execution boundaries

Use reviewable implementation pull requests. This PR changes placement values and documents manual stop/copy/start commands. No migration helpers, special tests or additional monitoring components are added. It performs no automatic data transfer or deletion. Follow repository safeguards for Madrid connectivity; do not incidentally alter Tailscale, routes or firewall. Provide exact cluster-changing commands and rollback commands for the user to execute under the repository workflow.

## Verification

- Existing Grafana URL works; dashboards, users, datasource UIDs, alerts and service-account access survive.
- Grafana MCP lists dashboards and queries historical and current metrics.
- Fixed historical queries match baseline results; fresh samples arrive from all previous targets. Explain unexpected `up == 0` series.
- A controlled Telegram alert fires and resolves without duplicate notifications.
- Existing logs/traces, if discovered, remain queryable; measure gaps and delivery delay.
- Services mount Madrid volumes; pod replacement and a planned VM restart retain state and restore ingestion.
- Run `npm run test:smoke` after deployment and inspect Grafana/Datadog health and scoped errors.
- Record a tested restore/rollback procedure; retain backups until acceptance.

## Result

Prepared Madrid placement for Grafana, VMSingle, vmagent, vmalert, Alertmanager, kube-state-metrics, iperf scheduler, VM operator and Grafana MCP. Added [migration runbook](migration.md). Distributed collection stays on source nodes. Live inventory, transfer and deployment remain pending. The stopped-collector procedure has a documented scraping interruption.

See [project worklog](project-worklog.md).
