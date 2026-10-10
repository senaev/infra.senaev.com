# 2026-06-16 — Prowlarr: SQLite readonly + search returns empty

> **This file is the working log for the investigation.** All findings, command outputs,
> hypotheses confirmed/refuted, and the eventual fix must be appended here as we go.
>
> Format: append new dated sections under `## Findings` as work proceeds. Don't rewrite
> earlier sections — annotate them.

## Symptoms

1. Prowlarr logs the following error every ~30 seconds:
   ```
   [Error] TaskExtensions: Task Error
   [v2.3.5.5327] code = ReadOnly (8), message = System.Data.SQLite.SQLiteException:
   attempt to write a readonly database
   ```
   Stack trace: `Scheduler.ExecuteCommands` → `CommandQueueManager.Push` →
   `BasicRepository.Insert` → SQLite fails.

2. Webhook-endpoint calls `GET /api/v1/search?query=Hello&type=search`, gets HTTP 200
   but `responseSize=[2]` — which is the empty JSON array `[]`. No results for any query.

## Context (architecture)

- Prowlarr runs as a Kubernetes Deployment in `senaev-com` namespace, pinned to the
  `hetzner` node via `nodeSelector: vps: hetzner`.
- Storage: `hostPath` volume at `<clusterRootPath>/volumes/prowlarr/config`, mounted as
  `/config` in the container.
- A `fix-permissions` **initContainer** runs as root on every pod start:
  `chown -R 1000:1000 /config && chmod -R u+rwX,g+rwX /config`. It exits 1 (fails the
  pod start) if any file is still non-writable by uid 1000 after the repair.
- Main container runs as `PUID=1000 / PGID=1000` (linuxserver image).
- A **sidecar** (`qbittorrent-download-client-configurer`) runs Python scripts to
  configure qBittorrent as a download client and import indexers into Prowlarr. It mounts
  `/config` as `readOnly: true` (read-only in that container only — does not affect the
  main container's mount).
- The scheduler error is from Prowlarr's internal job runner trying to INSERT a command
  row into the SQLite command-queue table. This is unrelated to the search call itself.

## Why the two issues are likely linked

If the SQLite DB is read-only, Prowlarr can't persist anything — including the indexer
configurations that the sidecar script tries to write. With no indexers configured,
`/api/v1/search` correctly returns `[]`.

## Hypotheses, ranked

1. **(A) File permissions degraded on the host after pod start.**
   The initContainer fixes permissions at startup, but something on the `hetzner` host
   later changed ownership or mode of the `.db` file or its parent directory (reboot,
   manual `chown`, another process). The pod has been running without a restart so the
   initContainer hasn't re-run since.
   - Signal: write test inside the pod fails; pod uptime is long.
   - Fix: `kubectl rollout restart -n senaev-com deploy/prowlarr` — initContainer repairs.

2. **(B) Stale SQLite WAL/SHM files with wrong ownership.**
   A previous pod crash left `prowlarr.db-wal` or `prowlarr.db-shm` owned by root.
   SQLite can open the main `.db` file but can't lock/write the WAL → SQLITE_READONLY.
   - Signal: `ls -la` in `/config` shows `*.db-wal` or `*.db-shm` owned by root while the
     `.db` itself is owned by 1000.
   - Fix: delete the stale WAL/SHM files and restart the pod.

3. **(C) Host filesystem remounted read-only.**
   A disk I/O error caused the Linux kernel to remount the filesystem as `ro`, making
   all writes fail. Would affect all services on that node, not just Prowlarr.
   - Signal: `touch` test fails AND other services on hetzner are also erroring.
   - Fix: SSH to hetzner, check `dmesg | grep -i "remount\|error\|EIO"`, resolve the
     disk issue, remount rw, restart pod.

4. **(D) Indexers not configured (independent of DB issue).**
   The sidecar script may have never succeeded (e.g., Prowlarr wasn't ready when the
   script ran, or authentication failed). The DB might be fine, but there are simply no
   indexers, so search returns `[]` for any query.
   - Signal: DB write test passes, but `GET /api/v1/indexer` returns `[]`.
   - Fix: manually re-run the configurer script.

## Collaboration model

You drive — Claude does NOT run kubectl/SSH itself. For each step Claude gives you the
exact command; you run it and paste the output back. Claude reads it and tells you the
next step.

All commands below are **read-only** — no writes, no restarts — until the fault is
localised.

## Round 1 diagnostic commands

Run these (copy-paste), then paste all output back:

```bash
# 1. Pod age and restart count — how long has this pod been up?
kubectl get pods -n senaev-com -l app=prowlarr -o wide

# 2. DB file permissions inside the running container
kubectl exec -n senaev-com deploy/prowlarr -c prowlarr -- \
  find /config -name "*.db*" -ls 2>/dev/null

# 3. Full directory listing — look for stale WAL/SHM files and ownership
kubectl exec -n senaev-com deploy/prowlarr -c prowlarr -- \
  ls -la /config/prowlarr/ 2>/dev/null || \
  kubectl exec -n senaev-com deploy/prowlarr -c prowlarr -- ls -la /config/

# 4. Write test — can the running process actually write to /config?
kubectl exec -n senaev-com deploy/prowlarr -c prowlarr -- \
  sh -c 'touch /config/.write-test && echo "WRITE: OK" && rm /config/.write-test || echo "WRITE: FAIL"'

# 5. Recent Prowlarr logs — full error context
kubectl logs -n senaev-com deploy/prowlarr -c prowlarr --since=5m 2>&1 | tail -80

# 6. Indexer count via API — are any indexers configured?
kubectl exec -n senaev-com deploy/prowlarr -c prowlarr -- \
  sh -c 'wget -q -O- "http://localhost:9696/api/v1/indexer" \
    --header "X-Api-Key: $(grep -oP "(?<=<ApiKey>)[^<]+" /config/config.xml)" \
  2>/dev/null | head -c 200'
```

What each result means:

| Command | Result | Points to |
|---|---|---|
| **1** uptime | Pod is old (days/weeks), no restarts | Hypothesis A — permissions decayed on host |
| **2 / 3** ls | `*.db-wal` or `*.db-shm` owned by root | Hypothesis B — stale WAL |
| **2 / 3** ls | `.db` file itself not owned by 1000 | Hypothesis A |
| **4** write test | `WRITE: FAIL` | A or C — confirms DB directory is not writable |
| **4** write test | `WRITE: OK` | DB directory is fine — look deeper at specific DB file perms |
| **5** logs | Same readonly error repeating | Confirms symptoms; check for any additional context |
| **6** indexers | `[]` | Hypothesis D — indexers never got configured |
| **6** indexers | Non-empty JSON | Indexers exist; search failure is something else |

## Fix options (pending Round 1 output)

- **A — pod restart:** `kubectl rollout restart -n senaev-com deploy/prowlarr`
  The initContainer runs, fixes ownership/permissions on the entire `/config` tree,
  and the pod starts clean.

- **B — delete stale WAL/SHM then restart:**
  ```bash
  # Only if .db-wal / .db-shm are owned by root and Prowlarr is not actively writing
  kubectl exec -n senaev-com deploy/prowlarr -c prowlarr -- \
    rm /config/prowlarr/prowlarr.db-wal /config/prowlarr/prowlarr.db-shm 2>/dev/null
  kubectl rollout restart -n senaev-com deploy/prowlarr
  ```

- **C — filesystem remounted ro:** SSH to hetzner, run `dmesg | grep -i "remount\|EIO\|error"`.
  If the disk is the cause, that's a host-level incident requiring separate remediation.

- **D — re-run the indexer configurer** (after DB is writable):
  ```bash
  kubectl exec -n senaev-com deploy/prowlarr -c qbittorrent-download-client-configurer \
    -- python /scripts/configure-qbittorrent-download-client.py
  ```

## Verification

After any fix:
1. `kubectl logs -n senaev-com deploy/prowlarr -c prowlarr --since=2m` — the
   30-second SQLite error should stop.
2. Send a real search query (e.g., "Inception 2010") via Telegram → webhook logs should
   show `count > 0`.
3. Confirm the sidecar configured indexers: the `configure-qbittorrent-download-client.py`
   script logs should appear in the sidecar container's stdout.

---

## Findings

### 2026-06-16 — Round 1 results

**Command 1 — pod age:**
```
NAME                        READY   STATUS    RESTARTS   AGE   IP            NODE      NOMINATED NODE   READINESS GATES
prowlarr-85549599f8-zgcfp   2/2     Running   0          17d   10.42.0.148   hetzner   <none>           <none>
```
Interpretation: Pod has been running for **17 days with 0 restarts** — the `fix-permissions`
initContainer last ran on ~June 7 and has not re-run since.

**Command 2 — DB file ownership:**
```
3976816  -rw-rw-r--  1 root  root   32768 Jun  7 16:20 /config/prowlarr.db-shm
3976250  -rw-rw-r--  1 root  root   32768 Jun  7 08:44 /config/logs.db
3976815  -rw-rw-r--  1 root  root  288432 Jun  7 16:19 /config/prowlarr.db-wal
3976246  -rw-rw-r--  1 root  root  458752 Jun  7 16:20 /config/prowlarr.db
```
Interpretation: Every DB file — including the main `prowlarr.db`, WAL, SHM, and
`logs.db` — is owned by `root:root`. The running process is uid 1000. File timestamps
confirm Prowlarr stopped being able to write on **June 7**, matching when the ownership
changed.

**Command 3 — write test:**
```
touch: cannot touch '/config/.write-test': Permission denied
WRITE: FAIL
```
Interpretation: The `/config` directory itself is not writable by uid 1000. This confirms
the process cannot write anything, not just the DB files.

---

**Conclusion: Hypothesis A confirmed.** All files owned by root, write test fails, pod
uptime 17 days. Something on the hetzner host changed ownership of the entire `/config`
hostPath directory to root on or around June 7. The scheduler has been failing every 30
seconds since, and no new indexer config could be persisted, explaining the empty search
results.

Hypotheses B, C, D ruled out as primary cause (though B's WAL files being root-owned is
a symptom of A, not an independent cause).

---

### 2026-06-16 — Root cause identified (Round 2)

SSH'd to hetzner and ran `journalctl` filtered for chown/chmod/prowlarr/volumes on June 7.

**Smoking gun — journal output:**
```
Jun 07 15:41:22 hetzner sudo[3223885]: root : PWD=/root ; USER=root ; COMMAND=/usr/bin/chown -R root:root /k3s-cluster
Jun 07 15:43:11 hetzner sudo[3224684]: root : PWD=/root ; USER=root ; COMMAND=/usr/bin/chown -R root:root /k3s-cluster
Jun 07 18:47:27 hetzner sudo[3293219]: root : PWD=/root ; USER=root ; COMMAND=/usr/bin/chown -R root:root /k3s-cluster
Jun 07 19:15:09 hetzner sudo[3304219]: root : PWD=/root ; USER=root ; COMMAND=/usr/bin/chown -R root:root /k3s-cluster
Jun 07 19:27:43 hetzner sudo[3310057]: root : PWD=/root ; USER=root ; COMMAND=/usr/bin/chown -R root:root /k3s-cluster
```
Interpretation: `chown -R root:root /k3s-cluster` was run **5 times on June 7**,
interspersed with K3s pod restart activity (visible in the surrounding journal lines).
This recursively reset ownership of every file under `/k3s-cluster/` — including all
running pods' hostPath-mounted data directories — to root. Prowlarr's pod kept running
but all its DB files became root-owned and unwritable by uid 1000.

**Scope check — `find /k3s-cluster/volumes -not -user 1000`:**
```
/k3s-cluster/volumes            root:root
/k3s-cluster/volumes/webdav     root:root  (+ subdirs)
/k3s-cluster/volumes/webhook-endpoint  root:root  (+ subdirs)
/k3s-cluster/volumes/traefik    root:root  (+ acme.json)
/k3s-cluster/volumes/prowlarr   root:root
```
Interpretation: All four hostPath volumes were affected. `traefik/acme/acme.json` is
also root-owned — traefik may have had similar write issues but was less visible because
it doesn't log a recurring error for readonly state.

No cron jobs or backup services found that could explain it — this was a manual command.

---

### Fix applied — 2026-06-16

```bash
kubectl rollout restart -n senaev-com deploy/prowlarr
```

The `fix-permissions` initContainer re-ran as root, `chown -R 1000:1000 /config &&
chmod -R u+rwX,g+rwX /config`, verified clean, main container started. Confirmed by
`stat /k3s-cluster/volumes/prowlarr/config/` showing `Uid: 1000` after restart.

---

### 2026-06-16 — True root cause: bug in rsync-provisioning.sh

The `chown -R root:root /k3s-cluster` commands were not run manually. They came from
`scripts/rsync-provisioning.sh` line 25:

```bash
ssh ... "sudo mkdir -p $K3S_CLUSTER_PATH && sudo chown -R \$USER:\$USER $K3S_CLUSTER_PATH"
```

`\$USER` is escaped so it evaluates on the remote server — where the SSH user is `root`.
This makes it `chown -R root:root /k3s-cluster` on every deploy. It was run 5 times on
June 7 during a deployment/debug session, nuking ownership of all hostPath volumes.

The intent was to make the `provisioning/` directory writable for rsync. The bug: the
chown targets the entire cluster root (`$K3S_CLUSTER_PATH`) instead of just the
provisioning subdirectory (`$PROVISIONING_PATH`).

**Code fix applied** — scoped the chown and mkdir to `$PROVISIONING_PATH` only, and
merged the two ssh calls into one:

```bash
# Before (buggy):
ssh ... "sudo mkdir -p $K3S_CLUSTER_PATH && sudo chown -R \$USER:\$USER $K3S_CLUSTER_PATH"
ssh ... "mkdir -p $PROVISIONING_PATH"

# After (fixed):
ssh ... "sudo mkdir -p $PROVISIONING_PATH && sudo chown -R \$USER:\$USER $PROVISIONING_PATH"
```

File changed: `scripts/rsync-provisioning.sh`

---

## Resolution

**Root cause:** `scripts/rsync-provisioning.sh` contained a bug: on every deploy it ran
`chown -R root:root /k3s-cluster` on the hetzner host (because `\$USER` evaluates to
`root` on the remote). This recursively reset ownership of all hostPath volume data —
`prowlarr`, `traefik`, `webdav`, `webhook-endpoint` — to root. Prowlarr's pod kept
running but could not write to its SQLite database from June 7 onward, causing the
30-second scheduler error and empty search results.

**Immediate fix:** `kubectl rollout restart -n senaev-com deploy/prowlarr` — the
`fix-permissions` initContainer repaired `/config` ownership on pod start.

**Permanent fix:** Scoped the chown in `rsync-provisioning.sh` to `$PROVISIONING_PATH`
instead of `$K3S_CLUSTER_PATH`. Future deploys will no longer touch volume directories.

**Also affected:** `traefik/acme/acme.json` is still root-owned — traefik should also be
restarted to restore write access before its next cert renewal.
