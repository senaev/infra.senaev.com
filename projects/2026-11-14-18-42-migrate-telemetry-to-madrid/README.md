# 2026-11-14 — Migrate telemetry from Hetzner to senaev-madrid

- [x] **Status: completed.** Central telemetry and its existing data now run on Madrid.

## Goal

Move central telemetry to the existing Madrid worker. Accept a maintenance window and loss of disposable runtime state. No migration helpers, special tests or additional monitoring infrastructure.

## Context

**Shutdown PR #186 is deployed.** Both datasets were manually copied and checksum-verified. The user recreated both claims bound to Madrid PVs. Activation PR #191 is merged and deployed; retry succeeded after resolving manual pause-field ownership.

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

Grafana MCP now belongs to the telemetry namespace and vm-stack Helm release alongside Grafana, so both can start in the same Helm operation. cluster-helper uses its fully qualified telemetry Service address; the NetworkPolicy allows only namespace senaev-com plus app=cluster-helper. Cluster-helper authenticates public requests through OAuth and strips their credentials before proxying. MCP admission relies on the restricted NetworkPolicy; no internal shared token or public MCP ingress is configured. The Grafana service-account token remains for MCP-to-Grafana API access. Deployment planner ordering is unchanged; this removes the earlier pipeline change and full-build selection. Only cluster-helper needs an image rebuild for removing the proxy-token configuration. After deployment verify historical/fresh data, Grafana/MCP, log-generator placement/logs and Telegram alerts; record the collection gap.

## Result

Migration activated and verified. PR #191 merged as `d6541378`; [deployment attempt 2](https://github.com/senaev/infra.senaev.com/actions/runs/43653074385) succeeded after the user aligned the manually owned paused field with Helm. All ten central workloads are ready on `senaev-madrid`. Grafana/metrics claims use the copied Madrid datasets at 1Gi/50Gi. All 59 scrape targets are up; historical data before shutdown remains queryable. Original datasource IDs and dashboards are accessible through Grafana MCP; cluster-helper logs show successful tool calls. Madrid log-generator logs arrive in Datadog. Five post-deploy public website checks passed.

The optional secondary native VictoriaMetrics datasource plugin remains missing, with identical errors confirmed on Hetzner before migration; the primary datasource works. No synthetic alert or VM-restart test was run. User completed the guarded deletion of both retired Hetzner directories and PV objects; both PV deletion confirmations were received. Source paths and guarded cleanup commands are in the runbook. Only the two old telemetry datasets are in scope.

Project closed: PR #192 merged as `07fcf0cb` and [deployment](https://github.com/senaev/infra.senaev.com/actions/runs/43654869486) succeeded. The Helm-managed llama.cpp server on senaev-media is disabled, its restart alert removed, and deployment/pod/service/scrape/alert absence verified. All 58 remaining scrape targets were up and five public smoke checks passed. Model files are retained.

The user explicitly declined Proxmox backups. Restart/reboot recovery checks were not performed and are optional future work, not migration blockers. The pre-existing secondary datasource issue is handled by a separate maintenance PR enabling its missing Grafana plugin; post-deployment plugin health must still be checked. No new project or migration infrastructure was created.

Follow-up, 2026-11-15: Grafana and VMSingle moved from the hand-made PVCs to hostPath directories under `global.clusterRootPath/volumes` (PR #197, after #198 moved the shared values under `global`). Cutover verified: both pods ready, 58 of 58 targets up, no collection gap, Grafana login and datasources intact. The runbook (copy, switch, verify, cleanup, rollback) is in [migration.md](migration.md#follow-up-hostpath-instead-of-pvcs-2026-11-15). The old claims, PVs and `/k3s-cluster/volumes/telemetry` are removed; see the worklog.

See [worklog](project-worklog.md).
