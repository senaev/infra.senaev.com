# Two-PR manual migration

## 1. Deploy shutdown (PR #186)

Merge this PR and follow deployment **before copying**. It keeps placement on Hetzner:

- Grafana enabled with replicas zero: chart/PVC remain, writer stops.
- VMSingle enabled with replicaCount zero: operator reconciles shutdown; CR/PVC remain.
- vmagent, vmalert, Alertmanager, kube-state-metrics, iperf scheduler and Grafana MCP disabled.
- VM operator stays running to reconcile the zero-replica database.
- Distributed probes/exporters remain in place.

Disposable queues/silences/notification state need not be migrated. Grafana and metrics history are PVC-backed in this repo; a host directory behind a PVC is not necessarily protected from deletion. No special retention annotations, migration helpers or tests are introduced.

Use the user's personal-cluster terminal, never the coding container's default Kubernetes context:

```bash
kubectl -n telemetry get pods -o wide
kubectl -n telemetry get deploy,sts
kubectl -n telemetry get pvc -o wide
kubectl get pv
```

Wait for Grafana/VMSingle pods and other central writers to terminate without force deletion. Verify data claims remain Bound. Scraping/evaluation stops; final unflushed/unsent samples can be lost during shutdown. Stored history is the dataset being copied.

## 2. Copy while stopped

Inspect actual names/paths/reclaim policies:

```bash
kubectl -n telemetry get pvc CLAIM_NAME -o yaml
kubectl get pv PV_NAME -o yaml
kubectl get storageclass -o yaml
```

Save configuration/manifests privately. Verify Madrid space/access. Keep image versions and Grafana encryption/authentication secrets unchanged. Pause unrelated deployments during transfer. Do not change networking.

On Hetzner, substitute the reviewed absolute paths; use new empty destination directories and appropriate SSH/sudo privileges:

```bash
ssh senaev-madrid 'sudo mkdir -p /DESTINATION_DIRECTORY'
sudo rsync -aHAX --numeric-ids --rsync-path='sudo rsync' \
  /SOURCE_DIRECTORY/ senaev-madrid:/DESTINATION_DIRECTORY/
sudo rsync -aHAXnc --numeric-ids --itemize-changes --rsync-path='sudo rsync' \
  /SOURCE_DIRECTORY/ senaev-madrid:/DESTINATION_DIRECTORY/
```

Checksum dry run must show no differences. Compare file counts/bytes too to catch target extras. Copy complete directories, including SQLite WAL/SHM files. Keep source files until acceptance. Any discovered log/trace backend needs its own stopped-directory transfer; none is defined in telemetry charts. Datadog is external.

## 3. Prepare ordinary destination volumes

Changing nodeSelector cannot relocate a node-local PV. For each copied dataset manually prepare:

- New PV name with original capacity/access mode/storage class, copied directory and Madrid hostname affinity.
- Directory source with `type: Directory` so missing paths do not silently become empty databases.
- Reservation for original claim name/namespace.
- Replacement PVC with original name/storage settings and Helm ownership metadata, bound explicitly using `spec.volumeName`.

When editing exported YAML, omit old status, API UID/resourceVersion/managedFields/ownerReferences, binding/selected-node annotations and incompatible selectors.

Before any source-claim deletion, inspect its actual PV policy. **Delete can erase the backing host directory.** If keeping the original during migration, change that PV to Retain first:

```bash
kubectl patch pv ORIGINAL_PV --type=merge \
  -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
```

With writers stopped, use manually prepared manifests for each reviewed claim:

```bash
kubectl create -f madrid-pv.yaml
kubectl -n telemetry delete pvc ORIGINAL_CLAIM_NAME
kubectl create -f madrid-pvc.yaml
kubectl -n telemetry get pvc -o wide
kubectl get pv NEW_PV_NAME -o yaml
```

Verify bindings/affinity/files. Never delete original PVs, remove mounted-claim finalizers or source directories during transfer. If the operator prevents editing a specific claim, stop and inspect instead of racing reconciliation. Keep Helm values at zero until destination data is ready.

## 4. Enable on Madrid in a second PR

Additional agreed scope:

- Increase metrics capacity from the default 20Gi to `50Gi`: set `victoria-metrics-k8s-stack.vmsingle.spec.storage.resources.requests.storage` explicitly and use matching capacity in the destination metrics PV/PVC prepared in stage 3. This is the Kubernetes GiB quantity for the requested roughly 50GB; it does not create a filesystem quota for a local directory.
- Move `logGenerator.vps` to `senaev-madrid` alongside the other central workloads. Verify log-generator placement and log delivery through existing Datadog monitoring after deployment.

Restore Grafana/VMSingle replicas to one, re-enable other central components and set central selectors (including VM operator and Grafana MCP) to Madrid. Zero-replica CRs stay in place throughout storage work. The user paused VMSingle reconciliation for claim replacement; activation must explicitly set `spec.paused: false`. No manual premerge CR-placement patch is required. Distributed sources stay distributed; ingress/DNS stays on Hetzner.

Merge only after destination bindings and copied files are verified. Follow deployment; check historical data, fresh metrics, Grafana login/dashboards/datasources, MCP and Telegram alerts with existing monitoring. Record collection gap. Remove source data only in a separate cleanup action after acceptance.

For rollback, disable through Helm first. Preserve new Madrid writes, restore source bindings and Hetzner placement, then re-enable. A configuration revert cannot reverse bindings, and a stale source copy omits post-cutover data.

## Confirmed pre-activation checkpoint

User completed and checksum-verified both rsync copies, set source PVs Retain, and recreated original-name claims bound to `telemetry-grafana-madrid` (1Gi) and `telemetry-metrics-madrid` (50Gi). Native VMSingle paused status was acknowledged before claim replacement. Activation uses explicit matching volumeName settings and resumes reconciliation.

Grafana MCP moves into the telemetry namespace and vm-stack release, deploying together with Grafana. cluster-helper uses `http://mcp-grafana.telemetry.svc.cluster.local:8000/mcp`. No internal proxy bearer token is required; NetworkPolicy admission requires both the senaev-com namespace and cluster-helper pod label on TCP 8000. There is no public ingress for this service. Public OAuth stays in cluster-helper, and MCP-to-Grafana service-account authentication stays unchanged. No deployment-order change or migration-specific pipeline is needed.
