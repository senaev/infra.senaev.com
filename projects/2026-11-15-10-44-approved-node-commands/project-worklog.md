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
