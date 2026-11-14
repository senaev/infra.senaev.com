# Project worklog

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
