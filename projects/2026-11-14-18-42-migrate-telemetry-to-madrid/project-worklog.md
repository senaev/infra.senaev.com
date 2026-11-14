# Project worklog

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
