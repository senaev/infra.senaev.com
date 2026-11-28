## 2026-11-28 10:30 UTC — The command gets its whole timeout

Without the holds, nothing needs `endsBy` to be exact, so the command no longer gets only what
is left of its timeout after the record is saved. It always gets `timeoutSeconds`, and the
error "The execution was saved too late to start the command" is gone. `endsBy` is computed
before the save, so it is early by the save time; it is used only in the note "it may still
run on the host until".

## 2026-11-28 10:00 UTC — No tracking of commands whose end node-shell did not see

The user decided to drop the corner cases of commands whose end node-shell does not see: ssh
exits with 255 (a dropped connection, or the command's own 255), a signal ends the wait, or
node-shell restarts while a command runs. Such a command is now `failed` (or `interrupted` after
a restart), and its `error` says that it may still run on the host until `endsBy`. There is no
`mayStillRun`, no hold on new commands and no stop of an earlier process's unit: `DELETE` stops
only a command that this process runs, and answers `not-running` for any other. The trade-off,
accepted because each command is approved in Telegram and these cases are rare: in them, the
next command can run while the earlier one still runs on its host, and it can be stopped only
with an approved `systemctl stop node-shell-<id>`. A repeated `DELETE` still waits for the last
stop and tries again only after a failed one.

## 2026-11-28 09:00 UTC — The request ID is the execution ID

The user decided that cluster-helper uses the `requestId` of a request as its execution ID in
node-shell. A request must never run again, so one ID per request is enough, and node-shell's
"once per ID" rule then also guarantees it. The ID is known to the agent before the approval;
the user confirmed that this is fine: only cluster-helper can call node-shell, and the ID is no
secret. Plan step 4 and the confirmed decisions in the README now say so.

## 2026-11-27 22:30 UTC — Records in memory, saved in the background

The user asked to move the write logic out of the execution manager into its own entity, with
an asynchronous interface only where it is needed. `executionRecords.ts` loads all records at
startup and keeps them in memory; the JSON files of `executionStore.ts` are only for restarts.
`get`, `list` and `update` are synchronous: an update changes the record at once, and its write
runs in the background, one write at a time per execution and always of the latest record; a
failed write is logged and tried again after 5 seconds. `create` resolves once the record is on
disk, so a restart never starts a command again, and `removeOlderThan` removes the records from
the disk and then from memory. The manager no longer has the map of unsaved results, the chain
of writes, the wait for a result being saved or the second read of an old `running` record:
it always sees the latest state. A failed stop replaced by a retry while the command ends now
gives way to the retry.

## 2026-11-27 21:00 UTC — Stop a command with DELETE

The user asked for a way to stop a running command. `DELETE /executions/:id` runs
`systemctl stop node-shell-<id>` on the command's host (locally or through ssh), which kills the
unit's whole cgroup (SIGTERM, then SIGKILL after `TimeoutStopSec`) and waits for it. Answers: 202
with the record when it was stopped (the record is saved as `stopped` with `stoppedAt` soon
after), 200 when nothing runs any more, 404 for an unknown ID, 502 when `systemctl` fails. A unit
that is already gone (`systemctl` exit 5) counts as stopped. A record of an earlier process with
`mayStillRun` can be stopped too.

Codex review of the stop: a stop could come before systemd created the unit, find no unit and
report a success while the command still started. Now the stop first creates
`/run/node-shell-<id>.stop` on the host, and the unit's shell exits 143 without running the
command when that file exists. Only a confirmed stop marks a record `stopped`; a failed one
leaves its own result. A confirmed stop of an earlier record removes its `mayStillRun`, and the
hold on new commands is released.

More Codex rounds found races between overlapping stops, the end of a command and the save of
its result. Each stop and finish step now works on in-memory state of its own execution:
a stop during the record creation or the result save reaches the stop marker or waits for the
save; a repeated stop reuses a confirmed one and starts over after a failed one. The holds are a
map from execution ID to `endsBy`, built at startup from the records with `mayStillRun`; a
dropped ssh adds its own entry, and a confirmed stop removes only its own. Nothing rebuilds the
holds from a store snapshot, which a command finishing at the same time could make stale.

## 2026-11-27 20:00 UTC — The node list is read for every command, with no cache

The user decided: drop `createHostResolver` and its one-minute cache. `resolveHost` validates the
name, runs hetzner itself locally, and otherwise reads the nodes with `k3s kubectl get nodes` on
every `PUT`. Commands are rare and approved one by one, so the extra second does not matter, and
a node that joins or leaves is seen at once.

## 2026-11-27 14:10 UTC — The one-command limit holds across restarts

Codex: after a restart the new process saw a free slot while the old command's systemd unit could
still run. Each record now has `endsBy` (start + timeout + `TimeoutStopSec` + SSH and margin);
`markInterruptedExecutions` returns the latest `endsBy` of the commands it marks `interrupted`, and
the manager answers `busy` until then. Also `TimeoutStopSec=15` on the unit (systemd's default 90 s
was longer than the client deadline grace).

## 2026-11-27 13:55 UTC — CodeRabbit round on node-shell

Fixed: a repeated `PUT` reads its saved record before the host is resolved (so a removed node
or an unreadable node list no longer hides the result); a result the store failed to save is
kept in memory, served by `GET` and saved again on the next read; the deadline kills the whole
process group and stops reading the output, so a descendant holding the pipes cannot keep the
execution open (seen: the old code waited 3 s for such a descendant); the output limit is
applied again after UTF-8 decoding. Not changed in node-shell: replay protection after the
24-hour retention. It is a rule for cluster-helper instead (plan step 4): new random ID per
approval, `PUT` only within 1 hour of it.

## 2026-11-27 13:40 UTC — One command at a time

The user decided: no commands in parallel. node-shell runs at most one command at a time, on all
hosts together; a new `PUT` while one is running is 429 `busy`, and nothing is saved for it.

## 2026-11-27 13:06 UTC — Read the hosts from the cluster nodes

galkin is no longer a node, and `nodeShell.sshDestinations` repeated the node list. Removed it:
node-shell now reads the nodes' `vps` labels with `k3s kubectl get nodes` in the hetzner host
(through the same `nsenter`, so still no service account token), keeps the list for a minute and
reaches every node except hetzner as `ssh root@<label>`. A host
that is not a node gets 400 `unknown_host`; if the list cannot be read, 503 `hosts_unavailable`
and nothing is saved.

## 2026-11-22 17:18 UTC — Implement the executor as node-shell

mTLS is in `main`, so the open authentication question is closed: cluster-helper → executor is
mTLS. Implemented `node-shell/` and its chart (`senaev-com/templates/node-shell.yaml`): one pod on
hetzner, `privileged` with `hostPID`, `nsenter --target 1 --all`, then the command in a transient
systemd unit with `RuntimeMaxSec`, directly on hetzner or through `ssh` from the host for the hosts
in `nodeShell.sshDestinations`. API on mTLS 8443 only for cluster-helper: `PUT` answers 202 at
once, `GET` reads the status. An execution ID is saved (file, atomic exclusive create) before the
command starts and kept 24 h; a restart marks `running` records `interrupted`, never retried. Pod
network egress closed; no probe, no plain port, no service account token. Not deployed yet; the
cluster-helper side (Telegram approval, `submit` / `status`) and the skill are the next PR.

```
 Test Files  9 passed (9)
      Tests  50 passed (50)
```

The node-shell suites pass: unit tests for hosts, command building, quoting and the execution
manager, and integration tests for the store, process runner, real-shell quoting and the mTLS server.

## 2026-11-20 15:45 UTC — Make the request API asynchronous

User was concerned that harnesses would not wait through approval. Decided: `submit`
returns `requestId` at once; `status(requestId, wait?)` reads the saved state, with a
long-poll of at most 25 seconds. `status` never starts or retries anything. Final results
are kept 1 hour for delivery, readable only by the submitting client. Reuses the
persistent state already planned for duplicate prevention.

## 2026-11-20 15:20 UTC — Run commands through the hetzner host and its SSH key

User confirmed that every node accepts the SSH key of hetzner's root, and chose to use it.
The executor is a privileged pod on hetzner with `hostPID: true`; it enters the host with
`nsenter -t 1 -a`, runs commands there directly, and reaches other nodes with `ssh` from
the host. No SSH key goes into Vault, a Secret or an `ssh-agent` sidecar, and no node needs
a change. SSH starts in the host network namespace, so the pod-to-tailnet question and the
`hostNetwork` fallback are gone; the pod keeps `hostNetwork: false`. Still open:
cluster-helper → executor authentication (mTLS recommended).

## 2026-11-20 14:50 UTC — Address PR #247 review: timeouts and hostNetwork

CodeRabbit found two gaps. Closing an SSH session does not kill what it started, so
each command now runs in a transient systemd unit with `RuntimeMaxSec`: systemd stops
the whole cgroup, even detached children. The `hostNetwork: true` fallback now requires
proof that the CNI still enforces the executor NetworkPolicy, else another control.

## 2026-11-20 14:25 UTC — Replace the DaemonSet with one SSH executor

User decided that a per-node DaemonSet is unnecessary: the control plane can reach every
node over SSH, and commands run as root anyway, so one executor on hetzner gives the same
result with far less to build. Dropped the DaemonSet, host-namespace setup, per-node
executor identities and per-node routing. The root SSH key is the new sensitive asset:
held in an `ssh-agent` sidecar, restricted by `from=` on each node, host keys pinned.
Nothing provisions node-to-node SSH today, so each node needs the key (one at a time).
Open: pod-network reach to tailnet addresses, and mTLS (PR #203) vs a shared token for
cluster-helper → executor; mTLS recommended.

## 2026-11-15 11:09 UTC — Confirm execution scope and lifecycle

User chose root execution, all Kubernetes nodes without exceptions, a maximum
10-minute approval TTL using the existing request expiry, and immediate failure
for offline nodes. Existing cluster logs supply history; no extra history archive.
Keep only operational state needed for approvals, result delivery and preventing
duplicate execution across restarts. Approval expiry and execution timeout remain
separate. Removed superseded open design choices from the main document.

## 2026-11-15 11:00 UTC — Link certificate foundation and open decisions

Separate certificate project now owns the reusable mTLS lifecycle, with the first
migration from cluster-helper to obsidian-sync. Node execution will reuse it.
Recorded remaining user-facing choices about host privilege, node scope, approval
lifetime/offline behavior and audit retention, with recommendations kept unapproved.

## 2026-11-15 10:44 UTC — Record command approval design

User chose a lightweight executor per node with Telegram approval in cluster-helper:
one request, one command, one result. Script inspection and interactive sessions are
outside scope. Explicitly decided to keep host networking disabled.

Added context, actionDescription and expectedOutcome to the request requirements.
Context is one short sentence with a maximum of 128 characters as tool-description
and skill guidance only, without runtime enforcement. The other explanations are concise.
Certificate lifecycle is still a proposal requiring a concrete implementation decision.
