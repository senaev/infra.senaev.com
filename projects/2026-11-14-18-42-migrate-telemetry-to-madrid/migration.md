# Manual telemetry migration: stop, copy, start

**Do not merge until steps 1–4 are complete.** Main automatically deploys placement changes. No live migration commands have been executed.

Move between nodes of the existing K3s cluster; a separate cluster is unnecessary. We accept a maintenance window: scraping and alert evaluation stop temporarily. Existing stored history survives copying. No migration helpers, special tests, independent collectors or additional monitoring services are needed.

## 1. Identify data

In the user's personal-cluster terminal (not a coding container's default context):

```bash
kubectl -n telemetry get pods -o wide
kubectl -n telemetry get deploy,sts
kubectl -n telemetry get pvc -o wide
kubectl get pv
kubectl get nodes -L vps,kubernetes.io/hostname
# Substitute actual names; repeat for every data volume:
kubectl -n telemetry get pvc CLAIM_NAME -o yaml
kubectl get pv PV_NAME -o yaml
```

Save manifests, Helm values, replica counts and image versions privately outside the repo. Identify complete Grafana/VMSingle directories and any other persistent telemetry state. Grafana also needs unchanged encryption/authentication secrets. Check Madrid capacity and SSH access. Make no networking changes.

No deployed log/trace backend is defined in telemetry charts. If found live, include its storage and service-specific stopped-copy procedure. Datadog storage is external. Ephemeral vmagent buffers and Alertmanager state are not preserved by copying Grafana/metrics volumes. Save active Alertmanager silences separately if needed; notification deduplication may reset.

## 2. Stop services, retain original data

Pause other deployments. For each selected source PV, set Retain before any claim deletion:

```bash
kubectl patch pv PV_NAME --type=merge \
  -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
```

Stop the VM operator first, using its actual Deployment name:

```bash
kubectl -n telemetry scale deployment/OPERATOR_NAME --replicas=0
```

Wait for termination. If CR validation requires the stopped operator webhook, resolve that availability issue before proceeding; do not disable validation blindly. Check StatefulSet claim retention is Retain/default before scaling them. Gracefully stop vmagent while VMSingle is healthy and its remote-write backlog is drained. Wait for vmagent termination, then stop Grafana, VMSingle, vmalert, Alertmanager, kube-state-metrics and iperf scheduler:

```bash
# Repeat using the actual controller kind/name:
kubectl -n telemetry scale deployment/NAME --replicas=0
# For StatefulSets instead:
# kubectl -n telemetry scale statefulset/NAME --replicas=0
kubectl -n telemetry get pods -o wide
```

Wait until all writers and pods mounting selected claims terminate; no force deletion. Leave distributed exporters, smokeping and iperf source agents in place. Back up complete stopped directories. Final unsent ephemeral samples are not guaranteed: this procedure preserves stored history and accepts a collection gap.

## 3. Copy directories manually

On Hetzner, with rsync on both hosts and appropriate sudo/SSH access, substitute reviewed absolute paths. Use new empty target directories:

```bash
ssh senaev-madrid 'sudo mkdir -p /DESTINATION_DIRECTORY'
sudo rsync -aHAX --numeric-ids --rsync-path='sudo rsync' \
  /SOURCE_DIRECTORY/ senaev-madrid:/DESTINATION_DIRECTORY/
sudo rsync -aHAXnc --numeric-ids --itemize-changes --rsync-path='sudo rsync' \
  /SOURCE_DIRECTORY/ senaev-madrid:/DESTINATION_DIRECTORY/
```

The checksum dry run must show no differences. Compare file counts/bytes too, since the copy deliberately uses no deletion and would leave unexpected target extras. Preserve permissions/numeric ownership and complete directories, including SQLite WAL/SHM files. Writers remain stopped. Keep original Hetzner files untouched and software versions unchanged.

## 4. Attach copies before merge

A nodeSelector does not move a node-local PV. For each original claim, manually create a **new** PV using its original capacity/access mode/storage class, Madrid's actual hostname label and the copied directory:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: NEW_PV_NAME
spec:
  capacity:
    storage: ORIGINAL_CAPACITY
  accessModes: [ReadWriteOnce]
  storageClassName: ORIGINAL_STORAGE_CLASS
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /DESTINATION_DIRECTORY
    type: Directory
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values: [ACTUAL_MADRID_HOSTNAME]
  claimRef:
    namespace: telemetry
    name: ORIGINAL_CLAIM_NAME
```

Save as `madrid-pv.yaml`, replacing every placeholder. Edit the original exported PVC YAML: retain name/namespace, capacity/access mode/storage class, labels and Helm ownership annotations. Set `spec.volumeName` to the new PV name. Remove `status`, metadata UID/resourceVersion/creationTimestamp/managedFields/ownerReferences, binding/selected-node annotations and any selector excluding the new PV. Save as `madrid-pvc.yaml`.

With reconcilers and writers still stopped, repeat for each claim:

```bash
kubectl create -f madrid-pv.yaml
kubectl -n telemetry delete pvc ORIGINAL_CLAIM_NAME
kubectl create -f madrid-pvc.yaml
kubectl -n telemetry get pvc -o wide
kubectl get pv NEW_PV_NAME -o yaml
```

Only the claim object is deleted. Original PVs must remain Released/Retain with data intact. Never delete original PVs or remove protection finalizers if a claim is mounted. Verify every new claim is Bound to the correct Madrid PV/path and the files are present. These are ordinary replacement application volumes; include them in existing backup management.

Before merge, with operator still stopped, patch the stack's actual four CRs to Madrid. CI deploys operator before vm-stack; it must not reconcile old Hetzner placement against Madrid claims:

```bash
# Repeat using each actual vmsingle, vmagent, vmalert and vmalertmanager name.
kubectl -n telemetry patch KIND/ACTUAL_NAME --type=merge \
  -p '{"spec":{"nodeSelector":{"vps":"senaev-madrid"}}}'
```

Checkpoint before merge: writers stopped, copies verified, replacement claims Bound on Madrid, four CRs targeting Madrid, original data retained.

## 5. Enable and check

Merge PR #186 and follow deployment. It moves central services, operator/helpers and Grafana MCP; public ingress/DNS stays on Hetzner. If a scaled controller stays at zero after reconciliation, restore its saved replica count only after both template placement and claim bindings point to Madrid.

```bash
kubectl -n telemetry get pods -o wide
kubectl -n telemetry get pvc -o wide
kubectl -n telemetry get deploy,sts
```

Check Grafana login/dashboards/datasources, historical metrics and fresh samples from all previous targets. Check Grafana MCP and Telegram alerts, using existing monitoring. Record the collection gap and restore active silences if applicable. Keep original Hetzner data until accepted; cleanup is separate.

## Rollback

Stop operator and writers again. Before new writes, the retained original data is the recovery copy. After Madrid accepts writes, preserve and consistently copy the complete current dataset back first, or rollback would lose post-cutover history/edits. An additive copy leaving stale database files is not an exact restore.

Recreate original-name claims bound to retained Hetzner PVs: clear stale source claimRef only after writers and Madrid replacement claims are gone. Restore Hetzner placement before enabling services. A config revert alone cannot reverse claim bindings. Keep both copies until recovery is checked.
