# Project worklog

## 2026-11-15 09:10 UTC — Follow-up: move Grafana and VMSingle data from PVCs to hostPath

The user asked to replace the two hand-made static PVs with plain host directories, and to copy the data to new standard paths under `/k3s-cluster/volumes` instead of reusing the old directories, then delete the old data after acceptance. Scope: only Grafana and VMSingle; the LLM workspace PVCs are out of scope. The live PVs show the old directories `/k3s-cluster/volumes/telemetry/grafana` and `.../victoriametrics` (local, `Retain`, node affinity `senaev-madrid`).

Decisions:
- New paths `<clusterRootPath>/volumes/grafana` and `<clusterRootPath>/volumes/victoriametrics`, built from `global.clusterRootPath` of `global-values.yaml` (`/k3s-cluster`). Subcharts see only `global`, so PR #198 moved all shared cluster values under `global` (and renamed `common-values.yaml`); this PR was merged with `main` after it. The VMSingle spec is templated with `.helm.Values.global.clusterRootPath`; Grafana uses `extraContainerVolumes`, because the chart does not template `extraVolumes`.
- VMSingle: `spec.storage: null` and a `data` hostPath volume. Checked in operator v0.68.0 (`StorageVolumeMountsTo`): a volume named `data` replaces the default data volume, and the operator rejects it together with `storage`. `null` removes the chart default only with `-f values.yaml`, which `upgrade-namespace.sh` does.
- Grafana: the chart cannot make `storage` a hostPath, so persistence is off and a separate hostPath is mounted at `/var/lib/grafana-data` with `paths.data` set to it. Plugins and provisioned dashboards go to the emptyDir.
- `type: Directory` on both volumes. The deploy stops the old pods, and the new pods wait for the directory, so the final copy happens with both databases stopped and without any manual patch of Helm-owned fields (the cause of the `spec.paused` conflict on 2026-11-14).
- Old directories and PVs stay until the user accepts the result, then a guarded cleanup.

Helm lint of all charts (`npm run check:helm`) and `helm template` with `-f global-values.yaml -f values.yaml` pass: both paths render as `/k3s-cluster/volumes/...`, no PVC is rendered, the VMSingle CR has only the hostPath volume. Not deployed. The runbook is in [migration.md](migration.md#follow-up-hostpath-instead-of-pvcs-2026-11-15).

## 2026-11-15 00:03 UTC — Close migration; repair secondary datasource separately

User requested a separate maintenance PR, no new project, and closure of this project in that PR. PR #192 merged as 07fcf0cb; deployment run 43654869486 succeeded. Post-deployment monitoring verified no LLM Deployment/pod/Service, no LLM alert evaluation series, 58 scrape targets with min(up)=1, and five public smoke checks passed. Old telemetry datasets/PVs were already deleted by the user.

User declined Proxmox backups after inspection showed no scheduled jobs; no backup configuration was changed. Restart/reboot recovery remains untested optional follow-up. Migration is completed.

Secondary datasource diagnosis: primary VictoriaMetrics datasource health OK; VictoriaMetrics (DS) returns `Plugin not registered`, and its victoriametrics-metrics-datasource plugin is absent. The vendored chart provisions both datasources but leaves plugin installation optional. Add grafana.plugins in Helm values, preserving datasource IDs and data. Helm lint and offline template rendering passed; the rendered Grafana configuration includes the plugin. Deployment and live secondary health verification remain pending merge of this maintenance PR.

## 2026-11-14 23:44 UTC — User completed retired source cleanup

User ran the guarded cleanup block: both source PVs were Released/Retain before the two exact source directories were removed, followed by:

```text
persistentvolume "pvc-8a91d60b-0266-4f82-b161-feec239b5a5a" deleted
persistentvolume "pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8" deleted
```

The block used set -eu and proceeded past rm to successful PV deletion. Source cleanup is recorded as completed from user output; no independent filesystem readback performed. Migration and old-data cleanup are complete. Remaining requested change: PR #192 merge/deployment and verification of LLM shutdown/alert removal. Optional recovery/backup checks and pre-existing datasource plugin issue remain separate.

## 2026-11-14 23:40 UTC — Cleanup authorized; LLM shutdown prepared

User requested deleting old telemetry data, checking remaining work, and disabling senaev-media LLM plus its restart alert. Source cleanup is authorized but must be executed by the user under repository cluster-work rules. Added exact old paths/PVs with Released/Retain and current-binding checks to the runbook. No data deletion performed by the agent.

Repository inspection shows llama.cpp, not a managed Ollama daemon: llm-server image ghcr.io/ggml-org/llama.cpp:server-vulkan-b12098, models under mediaServerStoragePath/volumes/llm-server/models. Set llmServer.enabled false; removed llm-server-restarted rule permanently. Existing conditional templates also remove other LLM alerts, Deployment/Service/NetworkPolicy/scrape and LLM_SERVER_URL so the API advertises no local model. No model files or network configuration changed.

Remaining required checks: user confirms old data/PV deletion; merge/deploy LLM shutdown and verify absence. Longer observation/restart checks and optional datasource plugin repair are separate follow-ups.

## 2026-11-14 23:36 UTC — Activation retry succeeded; Madrid telemetry verified

Deploy run 43653074385 attempt 2 completed successfully after user aligned paused false. Post-deploy Grafana MCP tools list original datasource IDs and dashboards, return historical samples and fresh metrics. Cluster-helper logs confirm proxied tools/call query_prometheus with status 200.

Supporting query results:

```text
count(up) at 2026-11-14T22:00:00Z = 59
count(up) after activation = 59
min(up) after activation = 1
sum(kube_pod_status_ready{central workloads,condition="true"}) = 10
Grafana claim volumename = telemetry-grafana-madrid, requested bytes = 1073741824
Metrics claim volumename = telemetry-metrics-madrid, requested bytes = 53687091200
```

`kube_pod_info` shows all ten central pods on node senaev-madrid, including mcp-grafana and log-generator. Datadog confirms fresh logs from log-generator-5cc565f544-mvnzh. Five public website smoke tests passed after deployment. Existing source data/PVs were not deleted.

Scoped startup-log review found the optional secondary `victoriametrics-metrics-datasource` plugin missing; Datadog confirms identical error on Hetzner at 21:40 UTC before migration. Primary Prometheus-compatible VictoriaMetrics datasource works. MCP default-org warnings are nonfatal. No forced synthetic Telegram alert, negative NetworkPolicy probe, pod restart or VM reboot was performed. Source cleanup remains a separate explicitly authorized action.

## 2026-11-14 23:32 UTC — User aligned pause field; failed deployment retried

User successfully applied the guarded patch (test replicaCount zero, replace paused false):

```text
vmsingle.operator.victoriametrics.com/vm-stack-victoria-metrics-k8s-stack patched
```

Requested `gh run rerun 43653074385 --failed`; attempt 2 queued. No direct cluster operations by agent. Awaiting telemetry rollout before historical/current data and MCP validation.

## 2026-11-14 23:30 UTC — Activation merged; telemetry blocked by paused-field ownership

PR #191 merged as d6541378. Deploy run 43653074385: checks/build/sync and senaev-com deployment succeeded; telemetry vm-stack upgrade failed. Application readiness briefly waited on n8n provisioning, which completed. Log-generator produced logs on Madrid and cluster-helper served requests.

Exact deployment error:

```text
Error: UPGRADE FAILED: conflict occurred while applying object telemetry/vm-stack-victoria-metrics-k8s-stack operator.victoriametrics.com/v1beta1, Kind=VMSingle: Apply failed with 1 conflict: conflict with "kubectl-patch" using operator.victoriametrics.com/v1beta1: .spec.paused
```

The prior manual pause owns that field; Helm cannot change true to false through server-side apply. Recovery: user JSON-patches paused false only after an atomic test that replicaCount remains zero. Then rerun failed deployment so Helm applies the same paused value and activates Madrid replicas. No force-conflict global changes, data deletion or network changes. Post-deployment validation remains pending.

## 2026-11-14 23:19 UTC — Removed shared proxy token; NetworkPolicy is the admission boundary

User explicitly chose NetworkPolicy-only access to Grafana MCP, with cluster-helper as its only application ingress. Removed internal shared-token configuration from proxy types/runtime environment, both chart secret references and MCP server environment. Public OAuth validation is unchanged; proxy strips Authorization, cookies and origin instead of sending another bearer credential. Unexpected upstream 401/403 still maps to 502 without triggering client OAuth sign-in. Grafana service-account token for backend API access remains.

MCP stays ClusterIP-only with no public ingress. Its sole ingress peer combines namespace senaev-com AND app=cluster-helper on TCP 8000. Existing proxy/endpoint tests updated to verify credential stripping, OAuth rejection, streaming and upstream error behavior (26 focused tests passed). Cluster-helper typecheck passed. No Vault secret deletion or cluster changes performed. Activation requires a cluster-helper image rebuild; no deployment-order change.

## 2026-11-14 23:10 UTC — Move Grafana MCP into telemetry in the activation PR

User requested colocating MCP with Grafana instead of deployment reordering. Moved Deployment/Service/NetworkPolicy, token initialization/watch script, helper and values into vm-stack. Cluster-helper uses the telemetry FQDN; allowed-hosts matches that FQDN with port 8000. Ingress peer requires namespace senaev-com AND app=cluster-helper. Existing Vault internal token is synchronized to the telemetry secret. Public OAuth/MCP endpoint and Grafana token lifecycle are unchanged.

Restored deployment_plan.py exactly from main: no pipeline/ordering changes or forced full builds remain in the PR. Existing Helm lint passed; rendered manifests verified one telemetry MCP deployment/service/policy, none in senaev-com, matching endpoint/allowed Host, combined namespace+pod selector and script/secret references. No additional migration tests/infrastructure or deployment performed.

## 2026-11-14 23:04 UTC — Activation implementation prepared

Restore normal replicas/enabled flags, resume VMSingle with paused false, set matching existing PV bindings (Grafana 1Gi, metrics 50Gi), and move ten central workloads including log-generator to Madrid. Keep distributed sources and Hetzner ingress unchanged.

Detected blocking dependency: senaev-com formerly deployed before telemetry; Grafana MCP init waits for Grafana while Helm waits for MCP. Adjusted existing planner to put senaev-com last after infrastructure namespaces. This pipeline-file change intentionally selects full builds/charts under existing rules; no migration infrastructure/tests were added.

Existing Helm lint passed; manual rendered-manifest assertions verified placements, data bindings/capacity, unpaused VMSingle and unchanged distributed agents/ingress. No activation or cleanup performed yet.

## 2026-11-14 23:03 UTC — Madrid claim rebinding completed by user

User removed only the operator finalizer, deleted old claims and recreated original names while VMSingle reconciliation was paused. User output:

```text
vm-stack-grafana   Bound   telemetry-grafana-madrid   1Gi   RWO   local-path
vmsingle-vm-stack-victoria-metrics-k8s-stack   Bound   telemetry-metrics-madrid   50Gi   RWO   local-path
telemetry-grafana-madrid   1Gi   RWO   Retain   Bound
telemetry-metrics-madrid   50Gi   RWO   Retain   Bound
```

This completes pre-activation binding checkpoint. Prepare activation with paused false, replicas one, explicit matching volumeName/capacity, all central placements plus log-generator on Madrid. Original source PVs/files retained; cleanup not authorized.

## 2026-11-14 23:01 UTC — VMSingle reconciliation paused and acknowledged

User supplied:

```text
Paused: true
Status: {"observedGeneration":3,"updateStatus":"paused"}
```

The operator has acknowledged paused reconciliation. Next user step: remove only the metrics claim operator finalizer (keep Kubernetes PVC protection), delete the two stopped-writer claim objects and recreate original names bound explicitly to telemetry-grafana-madrid (1Gi) and telemetry-metrics-madrid (50Gi). Both source PVs already Retain and both copies checksum verified. Do not delete PVs or files. Activation remains pending.

## 2026-11-14 22:59 UTC — Source retention and Madrid PV creation confirmed

User output confirms:

```text
pvc-8a91d60b-0266-4f82-b161-feec239b5a5a   1Gi   RWO   Retain   Bound
pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8   20Gi  RWO   Retain   Bound
telemetry-grafana-madrid                   1Gi   RWO   Retain   Available
telemetry-metrics-madrid                   50Gi  RWO   Retain   Available
```

Both target PVs are reserved for original claim names and point at previously verified copies. Before metrics claim recreation, pause VMSingle reconciliation with its native `spec.paused: true`; do not stop the whole operator. Checked upstream operator v0.68.0: `internal/controller/operator/controllers.go` returns before reconciliation when Paused; `factory/reconcile/pvc.go` skips deleting PVCs and requires deliberate operator-finalizer removal for manual replacement. Only the operator finalizer should be removed after confirming paused reconciliation, no writer pods, Retain policy and checksum copies; keep Kubernetes PVC protection. Activation PR must explicitly set `spec.paused: false` and metrics request 50Gi. No claim deletions yet.

## 2026-11-14 22:57 UTC — Exact claim metadata and Madrid node confirmed

User supplied full PVC YAML: Grafana requests 1Gi, metrics 20Gi; both ReadWriteOnce, Filesystem, local-path. Grafana carries Helm ownership for vm-stack/telemetry. Metrics carries VMSingle owner UID `74b96041-ef48-4bed-b77e-7c0f75b4b89d` and finalizer `apps.victoriametrics.com/finalizer`, so operator reconciliation must be handled deliberately during rebinding. Do not strip finalizers blindly.

Supporting user output excerpts:

```yaml
name: vm-stack-grafana
resources:
  requests:
    storage: 1Gi
---
name: vmsingle-vm-stack-victoria-metrics-k8s-stack
finalizers:
- apps.victoriametrics.com/finalizer
- kubernetes.io/pvc-protection
resources:
  requests:
    storage: 20Gi
```

```text
NAME            STATUS   ROLES    AGE     VERSION        HOSTNAME
senaev-madrid   Ready    <none>   5h44m   v1.36.5+k3s1   senaev-madrid
```

Next user step: set source PVs Retain, create ordinary Madrid local PVs (Grafana 1Gi, metrics 50Gi) pointing at checksum-verified directories and reserved for original claim names. No claim deletion or activation yet.

## 2026-11-14 22:55 UTC — Both checksum comparisons passed

User reported "no output for both" after the supplied `rsync -aHAXnc --numeric-ids --itemize-changes` comparisons. No source-to-destination checksum/metadata differences were reported for Grafana or metrics. Copies remain on Madrid; original PVCs/PVs remain untouched. Next: inspect exact PVC specs/metadata and Madrid hostname to prepare 1Gi Grafana and requested 50Gi metrics destination bindings.

## 2026-11-14 22:53 UTC — User completed both directory transfers

User reported: "both rsyncs are finished". Intended targets are `/k3s-cluster/volumes/telemetry/grafana/` and `/k3s-cluster/volumes/telemetry/victoriametrics/` on senaev-madrid, copied from the two recorded Hetzner local-volume directories. Completion is user-reported; checksum verification remains pending. Next: read-only rsync checksum comparison before destination bindings or activation.

## 2026-11-14 22:53 UTC — Activation scope extended

User requested adding metrics capacity 50GB and log-generator relocation to the second PR plan. Record an explicit `50Gi` VMSingle request plus matching destination PV/PVC capacity, and `logGenerator.vps: senaev-madrid`. Capacity is declarative for local volumes, not a filesystem quota. This update changes the plan only; services remain disabled and no volume operations were performed.

## 2026-11-14 22:48 UTC — Shutdown verified; user supplied actual source volumes

PR #186 merged as 85733b88. Deploy run 43649625095 succeeded; Datadog reported both writer desired replicas zero and both PVCs Bound. VictoriaMetrics logged clean shutdown at 22:46:29 UTC. Five post-deployment public website smoke checks passed. User pod listing subsequently confirms no Grafana/VMSingle pods; only distributed sources and operator remain.

User-provided volume output (empty HostPath lines omitted):

```text
Claim: vm-stack-grafana
PV: pvc-8a91d60b-0266-4f82-b161-feec239b5a5a
Policy: Delete
LocalPath: /var/lib/rancher/k3s/storage/pvc-8a91d60b-0266-4f82-b161-feec239b5a5a_telemetry_vm-stack-grafana
Affinity: {"required":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"In","values":["hetzner"]}]}]}}

Claim: vmsingle-vm-stack-victoria-metrics-k8s-stack
PV: pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8
Policy: Delete
LocalPath: /var/lib/rancher/k3s/storage/pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8_telemetry_vmsingle-vm-stack-victoria-metrics-k8s-stack
Affinity: {"required":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"In","values":["hetzner"]}]}]}}
```

Both are local volumes, not direct hostPath mounts, with Delete reclaim policy. Do not delete claims before preserving copies/setting Retain as needed. Next: source sizes and destination capacity/access, then manual copy. Activation worktree created from deployed main; no cluster writes or data transfers performed.

## 2026-11-14 22:23 UTC — Converted PR to Helm shutdown stage; checked storage

Checked vendored Grafana PVC template (no keep annotation), configured Grafana 1Gi claim and VMSingle default 20Gi PVC. Applications use PVCs, not direct hostPath mounts. Live backing paths/storage class/reclaim policy remain unknown until personal-cluster inventory. A host directory behind a Delete PV may be erased with its claim.

PR now retains Hetzner placement and uses ordinary zero-replica settings for Grafana/VMSingle. Other central components are disabled; operator remains to reconcile shutdown. Disposable runtime state need not be preserved. No extra retention annotations, helpers, infrastructure or tests. Manual copy and Madrid activation occur after this deployment in separate stages.

Helm rendering confirms both storage writers at zero with storage definitions present; vmagent/vmalert/Alertmanager, kube-state-metrics/scheduler and Grafana MCP absent. All existing Helm charts lint successfully. No cluster changes performed.

## 2026-11-14 21:58 UTC — Simplified to manual stop/copy/start

User requested no special migration tests or infrastructure and accepted temporarily disabling services. Removed the migration helper, its tests and CI addition. Kept normal placement values and replaced the runbook with manual shutdown, whole-directory rsync/checksum, ordinary replacement PV/PVC bindings and restart steps. No cluster writes performed. Same K3s cluster; no additional cluster required. Stored history is preserved; scraping pauses.

## 2026-11-14 21:46 UTC — Implementation and cutover prepared

User requested implementation in the same PR. Updated from main and changed central stack/operator placement and Grafana MCP to Madrid. Ingress stays on Hetzner; distributed probes/exporters stay on their source nodes. No cluster writes performed.

Vendored chart inspection confirmed:

```yaml
vmsingle:
  spec:
    storage:
      accessModes:
        - ReadWriteOnce
      resources:
        requests:
          storage: 20Gi
```

Prepared an offline generator for explicitly selected exported node-local PVC/PV pairs: new Retain Madrid PVs, same-name replacement claims and rollback claims without stale API UIDs/binding annotations. The runbook requires stopped writers, checksums, retained source volumes and prepatched CR placement before merge because CI deploys the operator first. This procedure interrupts scraping; zero-gap collection requires an independently tested durable collector. Ephemeral Alertmanager state is distinguished from persistent history.

Validation: all Helm charts linted; rendered manifests verified all nine central placements on Madrid, distributed iperf agents retained source placement, and public telemetry ingress remained on Hetzner. Seven volume safety tests passed in 0.003s; added them to CI. Python syntax and diff whitespace checks passed. Live PV inventory, cluster dry-run and cutover remain unverified until the user runs inventory in the personal-cluster terminal.

## 2026-11-14 18:42 UTC — Migration project initialized

Created branch/worktree `telemetry-madrid-migration` from `origin/main` at `d269c50f` for the requested relocation of Grafana, VM stack and telemetry data. Used existing node name `senaev-madrid`; confirm destination during execution preparation.

Repository inspection returned:

```text
provisioning/helm/telemetry/vm-operator/values.yaml:3:    vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:13:      vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:65:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:71:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:90:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:126:        vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:130:      vps: hetzner
provisioning/helm/telemetry/vm-stack/values.yaml:181:    vps: hetzner
```

These values place central telemetry on Hetzner but do not establish live placement or PVC details. Grafana persistence is enabled; vmagent queue durability needs inspection. No dedicated log/trace backend chart was found under telemetry; the older ClickHouse project is a proposal, not deployment evidence.

Documented inventory, durable collection, backup/restore, staged transfer, ingress dependencies, verification and rollback with post-cutover write reconciliation. No cluster or deployment configuration changed.
