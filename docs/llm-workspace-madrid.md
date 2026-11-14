# Move the senaev LLM workspace to Madrid

The chart moves OpenCode + Telegram + OAuth proxy, OMP + auth proxy, and Code Tools
from `vps=hetzner` to `vps=senaev-madrid`. Public DNS and Traefik stay on Hetzner;
Services route to Madrid over the cluster network. Workspace names, secrets and
endpoints stay the same. Datadog gains a Madrid node Agent and APM eligibility.
All chart-defined container resource limits (including proxies) are removed
from every LLM workspace, including Galkin. Memory requests remain scheduler
reservations, not usage caps. NetworkPolicy and container security remain.
Local-path PVC sizes are not enforced disk quotas. Physical node capacity and
any cluster admission defaults still apply; verify live limits after cutover.

## Before merge: preserve the data

**Do not merge before this procedure.** Existing local-path PV node affinity pins
three PVCs to Hetzner, and OpenCode also has hostPath state. A Helm upgrade alone
cannot move these. Use an independent SSH session to the Hetzner control plane,
never Code Tools / OMP / OpenCode: stopping them interrupts this connection and
loses in-memory operation handles. Coordinate a maintenance window and pause
other deployments that could restart the workspace. Commands below are run as
root on Hetzner with its personal-cluster kubeconfig; never on a workstation.
No network, Tailscale or k3s configuration changes are needed.

1. Verify Madrid is Ready, has `vps=senaev-madrid`, sufficient free RAM/disk,
   working DNS, image pulls, and SSH from Hetzner. Record its actual hostname
   label (do not assume it equals its vps label). Check both nodes have rsync.

   ```bash
   kubectl get nodes -L vps,kubernetes.io/hostname
   ssh root@senaev-madrid 'hostname; free -h; df -h /; command -v rsync'
   ```

2. Save the Helm revision and volume manifests in a private backup directory.
   Export `MADRID_HOSTNAME` to the observed `kubernetes.io/hostname` value.
   These backups contain paths and workload configuration; keep them private.

   ```bash
   umask 077
   export BACKUP_DIR=/root/llm-workspace-before-madrid
   mkdir "$BACKUP_DIR"
   export MADRID_HOSTNAME='<observed hostname label>'
   helm history senaev-com -n senaev-com > "$BACKUP_DIR/helm-history.txt"
   kubectl -n senaev-com get deploy senaev-code-tools senaev-opencode-telegram senaev-omp-web -o json > "$BACKUP_DIR/deployments.json"
   for claim in senaev-projects senaev-code senaev-omp-web-state; do
     kubectl -n senaev-com get pvc "$claim" -o json > "$BACKUP_DIR/$claim-pvc.json"
     pv=$(kubectl -n senaev-com get pvc "$claim" -o jsonpath='{.spec.volumeName}')
     kubectl get pv "$pv" -o json > "$BACKUP_DIR/$claim-pv.json"
     kubectl patch pv "$pv" --type=merge -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
   done
   ```

3. Stop all writers and wait until all their pods have terminated. This also
   stops the Telegram client. Keep them stopped until copying and rebinding finish.

   ```bash
   kubectl -n senaev-com scale deploy senaev-code-tools senaev-opencode-telegram senaev-omp-web --replicas=0
   for app in senaev-code-tools senaev-opencode-telegram senaev-omp-web; do
     kubectl -n senaev-com wait --for=delete pod -l "app=$app" --timeout=180s
   done
   ```

4. Generate replacement static PV/PVC manifests and a path list from the snapshots.
   The original PVs remain retained on Hetzner. New PVs use the same absolute paths
   on Madrid, and bind by explicit volumeName; no dynamic empty volume is used.

   ```bash
   python3 - <<'PY'
   import json, os
   from pathlib import Path
   root = Path(os.environ['BACKUP_DIR'])
   paths = []
   for claim in ['senaev-projects', 'senaev-code', 'senaev-omp-web-state']:
       pv = json.loads((root / f'{claim}-pv.json').read_text())
       pvc = json.loads((root / f'{claim}-pvc.json').read_text())
       spec = pv['spec']
       path = (spec.get('hostPath') or spec.get('local') or {})['path']
       assert path.startswith('/') and '..' not in path.split('/')
       paths.append(path)
       name = f'{claim}-madrid'
       spec['persistentVolumeReclaimPolicy'] = 'Retain'
       spec['claimRef'] = {'namespace': 'senaev-com', 'name': claim}
       spec['nodeAffinity'] = {'required': {'nodeSelectorTerms': [{'matchExpressions': [
           {'key': 'kubernetes.io/hostname', 'operator': 'In', 'values': [os.environ['MADRID_HOSTNAME']]}
       ]}]}}
       new_pv = {'apiVersion': 'v1', 'kind': 'PersistentVolume', 'metadata': {'name': name}, 'spec': spec}
       pvc['spec']['volumeName'] = name
       annotations = {k: v for k, v in pvc['metadata'].get('annotations', {}).items()
                      if k.startswith('meta.helm.sh/') or k == 'helm.sh/resource-policy'}
       new_pvc = {'apiVersion': 'v1', 'kind': 'PersistentVolumeClaim',
                  'metadata': {'name': claim, 'namespace': 'senaev-com',
                               'labels': pvc['metadata'].get('labels', {}), 'annotations': annotations},
                  'spec': pvc['spec']}
       (root / f'{claim}-madrid.json').write_text(json.dumps({'apiVersion': 'v1', 'kind': 'List', 'items': [new_pv, new_pvc]}))
   paths.append('/k3s-cluster/volumes/opencode-data')
   (root / 'paths.txt').write_text('\n'.join(paths) + '\n')
   PY
   ```

5. Inspect `paths.txt` and the generated manifests. Confirm each source is the
   expected nonempty directory. On Madrid, each destination must be absent or
   empty; abort on preexisting data. Copy each directory preserving owners,
   permissions, hardlinks, ACLs and extended attributes. Do not delete sources.

   ```bash
   while IFS= read -r path; do
     test -d "$path" || exit 1
     ssh root@senaev-madrid "test ! -e '$path' || { test -d '$path' && test -z \"\$(find '$path' -mindepth 1 -print -quit)\"; }" || exit 1
     ssh root@senaev-madrid "mkdir -p '$path'" || exit 1
     rsync -aHAX --numeric-ids "$path/" "root@senaev-madrid:$path/" || exit 1
     rsync -aHAXnci --delete --numeric-ids "$path/" "root@senaev-madrid:$path/" > "$BACKUP_DIR/verify-$(basename "$path").txt" || exit 1
   done < "$BACKUP_DIR/paths.txt"
   ```

   Every verification file must be empty: checksum comparison includes hidden
   files, git metadata/worktrees, repositories, dependencies, sessions, OAuth
   state and credentials. Resolve any difference before continuing.

6. Recreate only these PVC objects, now prebound to the new static PVs. Original
   PVs must show `Retain` before deleting claims. Do not remove protection
   finalizers or delete any data directory.

   ```bash
   for claim in senaev-projects senaev-code senaev-omp-web-state; do
     kubectl -n senaev-com delete pvc "$claim" --wait=true
     kubectl create -f "$BACKUP_DIR/$claim-madrid.json"
   done
   kubectl -n senaev-com get pvc senaev-projects senaev-code senaev-omp-web-state -o wide
   ```

   Require all three Bound to the `*-madrid` PVs. Keep deployments at zero. Merge
   the PR and follow CI: Helm restores one replica on Madrid. Do not run the old
   Hetzner pods against these Madrid-bound claims.

## Verify after deployment

- Require all three deployments Ready on Madrid, with all mounts and previous
  files, worktrees and sessions present. Check generated and admission-injected
  containers for limits; investigate namespace LimitRange/ResourceQuota defaults
  if any remain. Confirm the node has no MemoryPressure/DiskPressure.
- Check OpenCode login/UI, its Telegram bot, OMP login and a harmless command.
  Call Code Tools list/read/run and verify git worktrees, credentials and MCP OAuth.
- Check Datadog's Madrid Agent, new service logs/traces, restarts, OOMs and errors;
  check Grafana pod/node metrics. Run `npm run test:smoke` from the repo root.
- Retain Hetzner copies and manifests until the migration is accepted. Cleanup
  is a separate action; never let local-path delete the original directories.

## Rollback

Before any Madrid writes, stop all workspace deployments again. Delete only the
three Madrid PVC objects (the new PVs are Retain). For each original PV, clear its
stale claimRef, keep Retain, and recreate the original PVC from its snapshot with
only apiVersion/kind, name/namespace, Helm labels/annotations and spec retained
(no UID, resourceVersion, status, finalizers or binding annotations). The original
spec.volumeName prebinds it to the original Hetzner PV. Wait for all to bind.
Use `helm rollback senaev-com <recorded-revision> -n senaev-com --wait --timeout 300s`
and revert this PR before the next deployment. Verify services on Hetzner.

If Madrid has accepted writes, first stop every writer and checksum-sync the
Madrid directories back to Hetzner while preserving a separate backup of the old
Hetzner copies. Otherwise rollback would lose the new work. Never start writers
on both nodes. Restore only after the reverse copy is verified.
