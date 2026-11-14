# Telemetry migration runbook

## Strategy and deployment gate

**Do not merge PR #186 until steps 1–6 are complete and reviewed.** Main auto-deploys changed charts. Placement changes alone leave pods Pending against Hetzner-bound claims. No commands below have been executed against the cluster.

Use a maintenance window and stopped-writer copy. This preserves stored history but deliberately interrupts scraping and alert evaluation while vmagent and storage move. It does not provide zero-gap collection. If uninterrupted collection is required, first implement/test an independent durable collector outside Madrid. An ephemeral queue is not durable storage.

Keep versions, release/service names, namespace, datasource UIDs and secrets unchanged. Public ingress/DNS remains on Hetzner and routes through Kubernetes Services. Node exporters, smokeping DaemonSet and iperf source agents remain distributed; the iperf scheduler moves. Grafana MCP moves with `senaev-com`. Datadog remains external. Hetzner still hosts the control plane.

For each local-path volume: retain the source PV, copy its stopped data directory, and recreate the same PVC name bound explicitly to a **new** Madrid PV. Do not rewrite the source PV affinity or delete source data. Target PVs use `Retain` and `hostPath.type: Directory`: missing directories must fail rather than create empty databases. These static PVs need explicit backup/lifecycle management; local-path will not clean them up.

Run cluster commands only in the user's known personal-cluster administration terminal, never a coding container's default Kubernetes context. Store artifacts privately outside the repo. Pause other deployments throughout the window; no unrelated merge, scheduled deploy, operator or GitOps reconciliation may restart writers unexpectedly.

## 1. Inventory and baseline (read-only)

From a checkout of this PR in the personal-cluster terminal:

```bash
set -euo pipefail
umask 077
export TELEMETRY_BACKUP="$HOME/telemetry-backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$TELEMETRY_BACKUP"
kubectl config current-context
kubectl get nodes -L vps,kubernetes.io/hostname
kubectl -n telemetry get pods -o wide
kubectl -n telemetry get deploy,sts -o json > "$TELEMETRY_BACKUP/controllers.json"
kubectl -n telemetry get pods -o json > "$TELEMETRY_BACKUP/pods.json"
kubectl -n telemetry get pvc -o json > "$TELEMETRY_BACKUP/pvcs.json"
kubectl get pv -o json > "$TELEMETRY_BACKUP/pvs.json"
kubectl -n telemetry get vmsingle,vmagent,vmalert,vmalertmanager -o json > "$TELEMETRY_BACKUP/vm-resources.json"
helm -n telemetry get values vm-stack -a > "$TELEMETRY_BACKUP/vm-stack-values.yaml"
helm -n telemetry get values vm-operator -a > "$TELEMETRY_BACKUP/vm-operator-values.yaml"
helm -n telemetry history vm-stack
helm -n telemetry history vm-operator
jq -r '.items[] | [.metadata.name,.spec.volumeName,.spec.resources.requests.storage] | @tsv' "$TELEMETRY_BACKUP/pvcs.json"
jq -r '.items[] | .metadata.name as $pod | .spec.volumes[]? | select(.persistentVolumeClaim) | [$pod,.name,.persistentVolumeClaim.claimName] | @tsv' "$TELEMETRY_BACKUP/pods.json"
```

Review every PVC, hostPath, emptyDir, container argument and mount path. Include **all actual persistent telemetry data**, not only Grafana/VMSingle. Stop if a source is not on Hetzner or uses CSI/network/block storage: the helper only supports node-local filesystems. Inspect other namespaces for log/trace backends; none are defined in the telemetry charts. If found, add service-specific flush/copy/restore steps before proceeding.

Save fixed-range metrics query results, earliest/latest timestamps, dashboard/datasource UIDs, users, Grafana alert rules and active Alertmanager silences. Preserve encryption configuration and secret references in the existing secret store. UI exports are not database backups. Use baseline ranges inside retention; normal retention expiry still applies during migration.

Check `ssh senaev-madrid 'df -h; free -h'`, source directory sizes, transfer throughput, destination disk headroom and independent backup capacity. Verify SSH to both hosts, Madrid Ready and VM autostart. Make no Tailscale, routing or firewall changes.

## 2. Generate an explicit volume plan

Use the real `kubernetes.io/hostname` value from step 1. Select exact claim names from the pod-to-claim inventory:

```bash
export TARGET_HOSTNAME='senaev-madrid' # replace if the actual hostname label differs
read -r -p 'Grafana PVC from inventory: ' GRAFANA_CLAIM
read -r -p 'VMSingle PVC from inventory: ' METRICS_CLAIM
python3 scripts/telemetry_volume_plan.py \
  --pvcs "$TELEMETRY_BACKUP/pvcs.json" --pvs "$TELEMETRY_BACKUP/pvs.json" \
  --target-hostname "$TARGET_HOSTNAME" \
  --claim "$GRAFANA_CLAIM" --claim "$METRICS_CLAIM" \
  --output "$TELEMETRY_BACKUP/plan"
cat "$TELEMETRY_BACKUP/plan/volumes.tsv"
```

Add repeated `--claim` arguments for **every additional persistent telemetry claim**, including vmagent/Alertmanager if present. Generate once with the complete list; use a new output directory to regenerate. The helper never calls Kubernetes or overwrites a plan. Review JSON, capacities, ownership metadata and paths. Verify target PV names do not exist and destination directories are new/empty.

Our wrapper enables Grafana persistence; vendored defaults give VMSingle 20Gi. Neither vmagent nor Alertmanager has explicit durable storage in wrapper values: live resources are authoritative. For ephemeral Alertmanager state, save active silences via GET `/api/v2/silences`; later restore each unexpired silence via POST after removing server-generated `id`, `status`, `updatedAt`. Notification deduplication history may reset and repeat notifications. If preserving its complete ephemeral state is required, add a validated state extraction/restore procedure first. Copying PVCs cannot preserve emptyDir state automatically.

## 3. Retain source PVs and stop writers

Before any claim deletion:

```bash
while IFS=$'\t' read -r claim source_pv source_host source_path target_pv target_path; do
  [[ "$claim" == claim ]] && continue
  kubectl patch pv "$source_pv" --type=merge \
    -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
done < "$TELEMETRY_BACKUP/plan/volumes.tsv"
```

Before scaling StatefulSets, inspect `spec.persistentVolumeClaimRetentionPolicy`. Both `whenDeleted` and `whenScaled` must be `Retain` (or the default Retain). If either is Delete, stop and explicitly change/verify that policy with the operator stopped before scaling the StatefulSet. A PV Retain policy preserves bytes but does not prevent a controller deleting its PVC.

Identify the actual operator Deployment and vmagent controller:

```bash
read -r -p 'Operator resource (deployment/name): ' OPERATOR_RESOURCE
read -r -p 'vmagent resource (deployment/name or statefulset/name): ' VMAGENT_RESOURCE
kubectl -n telemetry scale "$OPERATOR_RESOURCE" --replicas=0
kubectl -n telemetry get pods -o wide
```

Wait until the operator pod has terminated. If its admission webhook is required for CR updates, stop and plan webhook availability first; do not disable validation blindly. Capture vmagent metrics/logs and verify its remote-write backlog is drained while VMSingle is healthy. Stop vmagent **gracefully first**, keeping VMSingle alive until vmagent has fully terminated:

```bash
kubectl -n telemetry scale "$VMAGENT_RESOURCE" --replicas=0
kubectl -n telemetry get pods -o wide
```

Record the scraping-gap start. Do not force-delete. A drained queue before shutdown does not prove every final in-memory sample was delivered. If final samples/ephemeral buffers must be guaranteed, do not enter this window without the independent durable collector. Preserve any actual persistent queue as another selected data volume.

Stop the remaining central Deployments/StatefulSets (Grafana, VMSingle, vmalert, Alertmanager, kube-state-metrics, iperf scheduler), using each real name from inventory:

```bash
# Review this list before scaling: it excludes only the distributed iperf agents.
jq -r '.items[] | select(.metadata.name | startswith("iperf3-agent-") | not) | "\(.kind | ascii_downcase)/\(.metadata.name)"' \
  "$TELEMETRY_BACKUP/controllers.json" > "$TELEMETRY_BACKUP/stop-resources.txt"
cat "$TELEMETRY_BACKUP/stop-resources.txt"
while read -r resource; do
  kubectl -n telemetry scale "$resource" --replicas=0
done < "$TELEMETRY_BACKUP/stop-resources.txt"
kubectl -n telemetry get deploy,sts,pods -o wide
```

Distributed DaemonSets and iperf source agents need not stop. Wait until **all pods mounting selected claims terminate**. Preserve replica counts from `controllers.json`. No reconciler may recreate writers. Back up each complete stopped source directory independently now. Grafana backup includes the whole directory, including SQLite WAL/SHM files; VMSingle backup includes its whole storage directory.

## 4. Copy and checksum stopped data

For each reviewed row, run on Hetzner with rsync installed on both hosts and an account permitted to preserve numeric ownership. Set `SOURCE_PATH` and `TARGET_PATH` from that row. Use only reviewed paths without shell quotes in their names.

```bash
: "${SOURCE_PATH:?absolute source path}" "${TARGET_PATH:?new absolute Madrid path}"
ssh senaev-madrid "sudo mkdir -p -- '$TARGET_PATH'"
sudo rsync -aHAX --numeric-ids --rsync-path='sudo rsync' \
  "$SOURCE_PATH/" "senaev-madrid:$TARGET_PATH/"
sudo rsync -aHAXnc --numeric-ids --itemize-changes --rsync-path='sudo rsync' \
  "$SOURCE_PATH/" "senaev-madrid:$TARGET_PATH/"
```

The checksum dry run must show no differences. Target must be new/empty before copying; compare file counts and byte totals too, since rsync deliberately uses no `--delete` and cannot flag extra destination files. Writers stay stopped through final verification. Keep a separate backup, not only the new working copy.

## 5. Replace claims with reconcilers stopped

Create target PVs, delete **only the selected claim objects**, then recreate their names against the target PVs:

```bash
kubectl create -f "$TELEMETRY_BACKUP/plan/target-volumes.json"
# Review the exact selection and confirm source PVs are Retain first.
kubectl -n telemetry delete -f "$TELEMETRY_BACKUP/plan/target-claims.json"
kubectl create -f "$TELEMETRY_BACKUP/plan/target-claims.json"
kubectl -n telemetry get pvc -o wide
kubectl get pv
```

If claim deletion hangs, investigate remaining pod mounts; do not remove protection finalizers. Source PVs must be Released/Retain. New PVs/PVCs must be Bound one-to-one with Madrid affinity and verified files. Claim names remain unchanged. Generated claims preserve Helm ownership annotations but omit old API UIDs, binding annotations and ownerReferences. Never clear source claimRef during forward migration.

## 6. Prepare operator-owned placement before merge

Deployment order is vm-operator before vm-stack. Prevent the operator from waking up against old Hetzner CR placement with newly Madrid-bound claims. While the operator remains at zero, patch the four stack resource types:

```bash
for kind in vmsingle vmagent vmalert vmalertmanager; do
  kubectl -n telemetry get "$kind" -o name | while read -r resource; do
    kubectl -n telemetry patch "$resource" --type=merge \
      -p '{"spec":{"nodeSelector":{"vps":"senaev-madrid"}}}'
  done
done
kubectl -n telemetry get vmsingle,vmagent,vmalert,vmalertmanager -o yaml
```

This loop assumes inventory confirms only this stack's CRs exist in telemetry. Otherwise use the reviewed individual names. Check all stack CRs request Madrid, target claims are Bound, writers are stopped, copied data checks passed, and source backups remain intact. Record the checkpoint in the worklog. Do not restart old Grafana with its Hetzner selector.

## 7. Merge and follow deployment

Approve/merge only after the checkpoint. Follow coordinated Deploy: operator starts on Madrid, reconciles prepatched CRs, vm-stack updates Grafana/helpers, senaev-com updates Grafana MCP. Keep an independent cluster terminal open: senaev-com deployment can affect Code Tools.

```bash
kubectl -n telemetry get pods -o wide
kubectl -n telemetry get deploy,sts
kubectl -n telemetry get pvc -o wide
kubectl -n senaev-com rollout status deployment/mcp-grafana --timeout=180s
```

If a controller remains at zero after reconciliation, restore its saved replica count only after verifying its pod template targets Madrid and its claims bind there. Do not blindly restore old pod specs. Do not run Helm rollback alone: old placement with new volume bindings is incompatible.

## 8. Verify and accept

- All central telemetry pods and Grafana MCP run on Madrid; distributed probes/exporters remain distributed. All selected PVs have correct affinity/path/bindings. Inspect pod events, errors, restarts and node resource pressure.
- Grafana URL/login, users, dashboards, datasource UIDs, alert rules and encryption configuration match baseline. Grafana MCP lists dashboards and queries current `up` plus historical ranges.
- Fixed-range historical queries match saved results. New samples resume for every previous target. Record the actual collection gap; later counter values cannot reconstruct old gauge/CPU samples.
- A controlled Telegram alert fires/resolves; restore unexpired silences and check notification duplication.
- Any discovered log/trace storage follows its added service-specific verification. Metrics/Grafana copies do not move pod logs.
- Run `npm run test:smoke` and inspect scoped Grafana/Datadog signals. Verify Hetzner ingress→Madrid and cluster-helper→Grafana MCP connectivity.
- Observe at least 24 hours. In an agreed window, test pod replacement and Madrid VM restart for data retention/autostart. Add static Madrid volumes to backups and disk alerts.

Retain source data/PVs and backups until acceptance. Cleanup is a separate explicitly authorized action; this PR automatically deletes no source data.

## Rollback

Freeze deployments. Stop the operator, stop vmagent gracefully while Madrid storage is healthy, then stop all affected writers. Back up new Madrid data. Once Madrid accepts writes, Hetzner is stale: preserve/reconcile **all post-cutover writes** before reverting bindings. For a stopped-directory restoration, stage a complete current Madrid dataset on Hetzner and checksum it before replacing the source directory; preserve the original backup. An additive rsync can leave stale files and is not an exact database restore. If exact restoration is impossible, stop and use service-specific export/import or explicitly approve losing post-cutover writes.

After writers are gone and a valid complete dataset exists at the original source path:

```bash
kubectl -n telemetry delete -f "$TELEMETRY_BACKUP/plan/target-claims.json"
while IFS=$'\t' read -r claim source_pv source_host source_path target_pv target_path; do
  [[ "$claim" == claim ]] && continue
  kubectl patch pv "$source_pv" --type=json \
    -p='[{"op":"remove","path":"/spec/claimRef"}]'
done < "$TELEMETRY_BACKUP/plan/volumes.tsv"
kubectl create -f "$TELEMETRY_BACKUP/plan/rollback-claims.json"
kubectl -n telemetry get pvc -o wide
```

Keep Madrid PVs Retain. With the operator stopped, patch the four CR selectors back to Hetzner (step-6 loop with `vps: hetzner`). Revert this PR's placement through a reviewed revert PR, then deploy; restore saved replicas only when selectors, claims and affinity agree. Before forward merge, restore original chart values using recorded Helm revisions through normal deployment instead. Recheck history, collection, Grafana and alerts. A configuration revert alone never reverses volume bindings.

References: [PV lifecycle/prebinding](https://kubernetes.io/docs/concepts/storage/persistent-volumes/), [local-volume affinity](https://kubernetes.io/docs/concepts/storage/volumes/#local), [VMAgent persistence](https://docs.victoriametrics.com/operator/resources/vmagent/).
