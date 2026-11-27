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
reaches every node except hetzner as `ssh <nodeShell.sshUser>@<label>` (`sshUser: root`). A host
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
