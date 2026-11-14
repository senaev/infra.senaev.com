# 2026-11-14 — Migrate telemetry from Hetzner to senaev-madrid

Stop through Helm, copy stored data manually, enable on Madrid in a second PR.

## Goal

Move central telemetry to the existing Madrid worker. Accept a maintenance window and loss of disposable runtime state. No migration helpers, special tests or additional monitoring infrastructure.

## Context

**Shutdown PR #186 is deployed.** Both datasets were manually copied and checksum-verified. The user recreated both claims bound to Madrid PVs. This activation PR restores central services on Madrid; it has not deployed yet.

Source storage and shutdown behavior (recorded before activation):

| Service | Storage | Disable stage |
| --- | --- | --- |
| Grafana | Chart-managed 1Gi PVC, no Helm keep annotation | enabled true, replicas zero; retain claim |
| VMSingle | Operator-managed PVC, default 20Gi | enabled true, replicaCount zero; retain CR/claim |
| vmagent | No persistent queue configured | enabled false; unsent ephemeral data disposable |
| Alertmanager | No persistent storage configured | enabled false; runtime state disposable |
| vmalert | No local persistent storage configured | enabled false |
| kube-state-metrics / iperf scheduler / Grafana MCP | No application database | disabled |
| VM operator | Controller, no telemetry database | stays on Hetzner to reconcile shutdown |
| Distributed probes/exporters | Measurement sources on each node | stay distributed |

The important datasets are PVC-backed, not directly mounted hostPath in application values. A PVC may use a local host directory, but its deletion can also delete that directory under a Delete reclaim policy. Inspect live PV paths/policies before deleting claims. This PR adds no retention annotations or backup components.

Sources: [stack values](../../provisioning/helm/telemetry/vm-stack/values.yaml), [vendored charts](../../provisioning/helm/telemetry/vm-stack/charts/), [operator](../../provisioning/helm/telemetry/vm-operator/values.yaml), [Grafana MCP](../../provisioning/helm/senaev-com/values.yaml).

No log/trace backend is defined in telemetry charts; discover any additional live data before transferring it. Datadog storage is external. Public ingress/DNS and control plane stay on Hetzner.

## Plan

1. Merge disable PR and follow deployment until central writers terminate.
2. Inspect actual claims/PVs/directories. Copy complete stopped directories to Madrid, preserving ownership and permissions; checksum.
3. Manually prepare destination volume bindings while services remain stopped. Inspect reclaim policy before deleting any source claim.
4. Prepare a second PR restoring normal replicas/enabled flags and moving central placement to Madrid. Explicitly increase VMSingle metrics storage to `50Gi` in Helm values and matching destination PV/PVC capacity, and move `logGenerator.vps` to `senaev-madrid` as well. Local-volume capacity declarations do not impose a filesystem quota. Merge only after data and bindings are ready.
5. Check historical data, fresh ingestion, Grafana/MCP and alerts. Keep source data until acceptance; cleanup is separate.

See [manual procedure](migration.md).

## Verification

Existing Helm lint passed. Rendered activation manifests match the existing claims: Grafana 1Gi on `telemetry-grafana-madrid`, metrics 50Gi on `telemetry-metrics-madrid`; VMSingle is explicitly unpaused with one replica. Ten central workloads target Madrid including log-generator. Distributed agents and Hetzner ingress stay in place. No custom tests added.

Grafana MCP now belongs to the telemetry namespace and vm-stack Helm release alongside Grafana, so both can start in the same Helm operation. cluster-helper uses its fully qualified telemetry Service address; the NetworkPolicy allows only namespace senaev-com plus app=cluster-helper. The existing Vault-sourced internal token is synchronized into telemetry. Deployment planner ordering is unchanged; this removes the earlier pipeline change and full-build selection. After deployment verify historical/fresh data, Grafana/MCP, log-generator placement/logs and Telegram alerts; record the collection gap.

## Result

Pre-activation checks complete: source PVs Retain; copied datasets verified; Madrid claims Bound at 1Gi and 50Gi. VMSingle is currently paused with zero replicas. Activation code restores services and resumes reconciliation. Source data is retained; no cleanup is authorized. Activation deployment and post-deploy verification remain pending.

See [worklog](project-worklog.md).
