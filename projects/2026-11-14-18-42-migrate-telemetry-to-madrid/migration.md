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

## Activation outcome and ownership caveat

PR #191 is deployed. The first attempt failed because the manual `kubectl-patch` manager owned `spec.paused: true`, conflicting with Helm's `false`. The user atomically tested replicaCount zero and patched only paused false; retrying the failed deployment then succeeded without global force-conflict settings. For future migrations, account for manual field ownership before resuming through server-side apply.

Post-deploy verification: ten central pods ready on Madrid, both expected volume bindings and capacities, 59/59 scrapes up, historical data queryable, Grafana MCP tools through cluster-helper successful, Madrid log-generator delivery and five public smoke checks passed. The user subsequently deleted the two retired Hetzner datasets and PV objects after guarded Released/Retain checks. Migration is complete; restart/reboot checks remain optional. See worklog for evidence and the pre-existing optional datasource plugin issue.

## Authorized source cleanup

User authorized cleanup after successful activation. Run only on Hetzner. Before any removal, confirm both old PVs have phase Released and policy Retain, while current claims still bind telemetry-grafana-madrid and telemetry-metrics-madrid. Stop if any check fails. No other data/model directories are in scope.

```bash
(
  set -eu
  for pv in pvc-8a91d60b-0266-4f82-b161-feec239b5a5a pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8; do
    test "$(kubectl get pv "$pv" -o jsonpath='{.status.phase}')" = Released
    test "$(kubectl get pv "$pv" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}')" = Retain
  done
  test "$(kubectl -n telemetry get pvc vm-stack-grafana -o jsonpath='{.spec.volumeName}')" = telemetry-grafana-madrid
  test "$(kubectl -n telemetry get pvc vmsingle-vm-stack-victoria-metrics-k8s-stack -o jsonpath='{.spec.volumeName}')" = telemetry-metrics-madrid
  sudo rm -rf -- \
    /var/lib/rancher/k3s/storage/pvc-8a91d60b-0266-4f82-b161-feec239b5a5a_telemetry_vm-stack-grafana \
    /var/lib/rancher/k3s/storage/pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8_telemetry_vmsingle-vm-stack-victoria-metrics-k8s-stack
  kubectl delete pv pvc-8a91d60b-0266-4f82-b161-feec239b5a5a pvc-c24e572d-2a1d-47ea-9d9b-d997486e9ec8
)
```

Confirm both original paths are absent and both old PVs return NotFound; current Madrid claims must remain Bound. Removing originals ends the source-copy rollback option. User subsequently completed the guarded cleanup block and supplied successful deletion output for both old PVs; the source-copy rollback option is now removed.

## Follow-up: hostPath instead of PVCs (2026-11-15)

Grafana and VMSingle keep their data in plain host directories, like n8n and Traefik, not in PVCs. The Madrid claims were hand-made static PVs; they add manual steps and nothing else on a single node. Only these two datasets are in scope. The LLM workspace PVCs are not.

| Service | Old directory (static local PV, `Retain`) | New directory | How it is mounted |
| --- | --- | --- | --- |
| Grafana | `/k3s-cluster/volumes/telemetry/grafana` | `/k3s-cluster/volumes/grafana` | `extraVolumes` hostPath at `/var/lib/grafana-data`, `grafana.ini` `paths.data` points there |
| VMSingle | `/k3s-cluster/volumes/telemetry/victoriametrics` | `/k3s-cluster/volumes/victoriametrics` | `spec.volumes` entry named `data`, `spec.storage` unset (operator v0.68.0 rejects both together) |

The new paths are `clusterRootPath` (from `common-values.yaml`) plus `/volumes/<name>`. Both volumes use `type: Directory`. While the new directory does not exist, the new pod waits in `ContainerCreating` and cannot start on an empty database. That is what makes the cutover safe: the deploy stops the old pods, and the new pods wait for the copy.

Plugins and provisioned dashboards of Grafana move from the PVC to the chart's emptyDir. Grafana installs and provisions them again at every start. The Grafana pod runs as UID 472, so its directory must be owned by `472:472`; `rsync -a --numeric-ids` keeps the owner of the old directory.

Run the `kubectl` commands where you run them for this cluster (Hetzner), and the file commands on `senaev-madrid`. Never run `kubectl` from the coding container.

### 1. Before merging: bulk copy while the services run (on senaev-madrid)

The temporary names start with a dot, so no pod mounts them. The copy of a running database is not consistent. Step 3 repairs it.

```bash
df -h /k3s-cluster
sudo du -sh /k3s-cluster/volumes/telemetry/grafana /k3s-cluster/volumes/telemetry/victoriametrics
sudo ls -ld /k3s-cluster/volumes/grafana /k3s-cluster/volumes/victoriametrics   # both must NOT exist

sudo rsync -aHAX --numeric-ids /k3s-cluster/volumes/telemetry/grafana/ /k3s-cluster/volumes/.grafana.tmp/
sudo rsync -aHAX --numeric-ids /k3s-cluster/volumes/telemetry/victoriametrics/ /k3s-cluster/volumes/.victoriametrics.tmp/
```

Stop here if the disk has less free space than the two directories need.

### 2. Merge the PR and watch the deploy

Helm stops the old Grafana and VMSingle pods and starts new ones. The new pods wait because the directories do not exist. Do not make them yet.

```bash
kubectl -n telemetry get pods -o wide -w
```

Wait until the old Grafana and VMSingle pods are gone. The deploy waits at most 300 s for readiness. If it fails while you copy, run the failed job again after step 4.

### 3. Final copy and switch (on senaev-madrid), only after the old pods are gone

```bash
(
  set -eu
  for pair in "grafana:.grafana.tmp" "victoriametrics:.victoriametrics.tmp"; do
    new="${pair%%:*}"; tmp="${pair##*:}"
    old="/k3s-cluster/volumes/telemetry/$new"
    sudo rsync -aHAX --numeric-ids --delete "$old/" "/k3s-cluster/volumes/$tmp/"
    test -z "$(sudo rsync -aHAXnc --numeric-ids --delete --itemize-changes "$old/" "/k3s-cluster/volumes/$tmp/")"
  done
  sudo ls -ldn /k3s-cluster/volumes/.grafana.tmp /k3s-cluster/volumes/.victoriametrics.tmp
  test "$(sudo stat -c %u:%g /k3s-cluster/volumes/.grafana.tmp)" = 472:472
  sudo mv /k3s-cluster/volumes/.grafana.tmp /k3s-cluster/volumes/grafana
  sudo mv /k3s-cluster/volumes/.victoriametrics.tmp /k3s-cluster/volumes/victoriametrics
)
```

`set -eu` stops the block at the first failure. The checksum dry run must print nothing. If the owner check fails, stop and tell me; do not `chown` blindly. `mv` inside one filesystem is atomic, so the pod never sees a half-copied directory. The kubelet retries the mount within about a minute.

### 4. Verify

```bash
kubectl -n telemetry get pods -o wide
kubectl -n telemetry get pvc
```

Check:

- Grafana and VMSingle pods are `Running` on `senaev-madrid`, with no `FailedMount` events.
- Grafana: login works, the datasources and the dashboards are there, the MCP service account still works (ask ChatGPT to list dashboards).
- Metrics from before the stop are queryable, fresh samples arrive, `min(up)` is 1.
- `kubectl -n telemetry get pvc` shows no Grafana claim. Helm deleted it. The VMSingle claim stays, unused, until step 5.
- Record the collection gap (from the old VMSingle stop to the new one ready).

The old directories and PVs stay untouched until you accept the result. That is the rollback source.

### 5. Cleanup after acceptance (separate action)

First on Hetzner. It checks that no pod uses a claim and that the PVs keep their data (`Retain`), then removes the leftover objects:

```bash
(
  set -eu
  test -z "$(kubectl -n telemetry get pods -o jsonpath='{.items[*].spec.volumes[*].persistentVolumeClaim.claimName}')"
  for pv in telemetry-grafana-madrid telemetry-metrics-madrid; do
    test "$(kubectl get pv "$pv" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}')" = Retain
  done
  kubectl -n telemetry delete pvc vm-stack-grafana vmsingle-vm-stack-victoria-metrics-k8s-stack --ignore-not-found
  kubectl delete pv telemetry-grafana-madrid telemetry-metrics-madrid
)
```

Then on `senaev-madrid`:

```bash
(
  set -eu
  sudo test -d /k3s-cluster/volumes/grafana
  sudo test -d /k3s-cluster/volumes/victoriametrics
  sudo rm -rf -- /k3s-cluster/volumes/telemetry/grafana /k3s-cluster/volumes/telemetry/victoriametrics
  sudo rmdir /k3s-cluster/volumes/telemetry
)
```

`rmdir` fails if anything else is in the folder; then stop and look. This ends the rollback option.

### Rollback before step 5

Revert the PR. Helm makes the claims again, but a `Released` PV keeps the old `claimRef` UID and will not bind to a new claim with the same name. Clear it first for each PV: `kubectl patch pv telemetry-grafana-madrid --type=merge -p '{"spec":{"claimRef":null}}'` (same for `telemetry-metrics-madrid`). Data written after the cutover exists only in the new directories; copy it back into the old ones with `rsync` while the pods are stopped, or accept the gap.
