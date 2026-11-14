# Project worklog

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
