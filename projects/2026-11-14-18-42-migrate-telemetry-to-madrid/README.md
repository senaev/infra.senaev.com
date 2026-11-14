# 2026-11-14 — Migrate telemetry from Hetzner to senaev-madrid

Stop through Helm, copy stored data manually, enable on Madrid in a second PR.

## Goal

Move central telemetry to the existing Madrid worker. Accept a maintenance window and loss of disposable runtime state. No migration helpers, special tests or additional monitoring infrastructure.

## Context

**PR #186 is now the disable stage only; it deploys before copying.** All source selectors remain Hetzner. Madrid activation belongs to a second PR.

Repository/vendored-chart storage findings (not a live volume inspection):

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
4. Prepare a second PR restoring normal replicas/enabled flags and moving central placement to Madrid. Merge only after data and bindings are ready.
5. Check historical data, fresh ingestion, Grafana/MCP and alerts. Keep source data until acceptance; cleanup is separate.

See [manual procedure](migration.md).

## Verification

Existing Helm lint/render checks: Grafana/VMSingle render at zero with storage intact; other central workloads absent. No custom tests added. After disable deployment, inspect stopped pods and remaining claims. After activation, check data and existing monitoring; record the collection gap.

## Result

Disable-stage code prepared; no cluster writes, claim deletions or data transfers performed. Live PV paths/policies still need inventory in the user's personal-cluster terminal.

See [worklog](project-worklog.md).
