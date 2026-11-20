# 2026-11-15 — Telegram-approved node commands

Allow LLM workspaces to request commands on Kubernetes nodes with explicit user approval.

## Goal

One request, one command, one result. Cluster helper asks the user in Telegram with
Approve / Reject buttons before running a command on the chosen node.

## Context

- Decision (2026-11-20): one executor on the control plane reaches every node. No DaemonSet
  and no per-node executor. Every approved command runs as root anyway, so a privileged pod
  on every node adds no safety; it only adds a host-root entry point per node.
- The executor is a small pod pinned to hetzner, separate from cluster-helper, which faces
  Telegram. It is `privileged: true` with `hostPID: true`, and enters the hetzner host with
  `nsenter -t 1 -a`. From there it acts as hetzner's root:
  - on hetzner itself, it runs the command directly in the host;
  - on any other node, it runs `ssh root@<node> -- <command>` from the host, over the
    tailnet by Tailscale hostname, with the SSH key of hetzner's root, which every node
    already accepts (confirmed by the user, 2026-11-20).
- No SSH key in Kubernetes: not in Vault, a Secret or an `ssh-agent` sidecar. The key
  stays on hetzner's disk, and no node needs a change. SSH starts in the host network
  namespace, where the tailnet already works, so the pod keeps `hostNetwork: false`
  and its API stays in the pod network.
- The executor is root on the control plane, which holds the k3s cluster keys and every
  Secret, and through the key root on every node. Treat it as the most privileged
  workload: one container, no other process in the pod, a minimal image, and only the
  authenticated API as input.
- SSH uses the host's own `known_hosts`, with `BatchMode=yes` and
  `StrictHostKeyChecking=yes`: no prompt, and a changed host key fails the command.
- Timeouts end the command on the node, not only the SSH session: closing a session does
  not kill what it started. The executor wraps each command in a transient systemd unit,
  `systemd-run --wait --pipe --collect -p RuntimeMaxSec=<timeout> -- /bin/sh -c <shell-quoted command>`.
  systemd stops the unit's whole cgroup at the limit (SIGTERM, then SIGKILL after the stop
  timeout), including children that left the process group. Every node runs systemd (k3s).
  Cancelling the request runs `systemctl stop` on the unit by its name, derived from the execution ID.
- SSH can also reach machines outside Kubernetes, such as the `proxmox-madrid` host.
  Which hosts the executor accepts is an explicit list in its configuration.
- Restrict executor API ingress with NetworkPolicy to cluster-helper's pod and the API port.
  No public Ingress or host port. NetworkPolicy is not authentication.
- Open: authentication of cluster-helper → executor. Recommended: the mTLS from the
  [inter-service certificate authentication project](../2026-11-15-11-00-inter-service-certificate-authentication/README.md)
  (PR #203), now for one connection only, with no per-node identities. Simpler alternative:
  a shared token plus NetworkPolicy. The executor holds root on every node, so mTLS is preferred.
- LLM workspaces must not hold executor credentials or direct access to the executor.
  No other workload on hetzner may be privileged or mount host paths, so none can read the key.
- Approve the exact command string and selected node. Inspecting or pinning scripts
  and transitive commands is outside scope. No interactive shell sessions.

## Request fields

In addition to the node, command, request ID, expiry and execution timeout, every
command request includes these three explanatory fields, all shown in Telegram:

| Field | Description for the calling agent | Example |
|---|---|---|
| `context` | Overall project/work purpose. One short sentence, maximum 128 characters. | Diagnose intermittent VPN transfer stalls. |
| `actionDescription` | Concisely explain what this particular command does. | Read current TCP socket statistics on the home node. |
| `expectedOutcome` | Concisely describe the result expected from this command. | Socket counters showing retransmissions and connection states. |

The 128-character and one-sentence guidance belongs in the command/tool description
and skill instructions only. Do not add runtime length/sentence validation,
truncation, or schema `maxLength` for these explanatory fields. Keep action description
and expected outcome concise as description guidance as well.

The explanations assist the user; execution always uses the exact displayed command.
Bind the approval to an immutable request, including its node and explanatory fields.

## Plan

1. Check on hetzner, as root, that SSH reaches every node non-interactively and that
   `known_hosts` has their keys (read-only, run by the user):
   `ssh -o BatchMode=yes -o StrictHostKeyChecking=yes root@<node> hostname`.
2. Decide the cluster-helper → executor authentication (see Context).
3. Check from a test pod with `privileged: true` and `hostPID: true` on hetzner that
   `nsenter -t 1 -a -- hostname` and `nsenter -t 1 -a -- ssh ... root@<node> hostname` work.
4. Implement persistent request/approval state in cluster-helper. Only the authorized
   Telegram user can approve; rejection returns `USER_REJECTED`, expiry `APPROVAL_EXPIRED`.
5. Implement the executor: authenticated API, `nsenter` into the hetzner host, then SSH; bounded
   connect time and output, runtime bounded on the node by the systemd unit (see Context);
   returns stdout, stderr and exit code.
6. Persist execution IDs before starting a command so duplicate dispatch cannot rerun
   it after restart. Unknown execution outcomes must not trigger automatic retries.
7. Add the workspace client/skill and narrowly scoped network access to cluster-helper.

## Verification

- No command starts before approval; rejection, expiry and wrong-user callbacks do not execute.
- Approval validity never exceeds 10 minutes; shorter TTLs are honored and late approvals fail.
- An unreachable node fails within the SSH connect timeout, without queuing.
- Commands execute as root on every cluster node, including hetzner itself.
- Existing cluster logs expose execution events; no separate history store is introduced.
- Telegram displays node, exact command, context, action description and expected outcome.
- Long explanatory text is not rejected or truncated by a new 128-character code limit.
- A command that outlives its timeout, including a child that detaches
  (`sh -c 'setsid sleep 600 & sleep 600'` with a 5-second timeout), leaves no process on the node.
- Approved diagnostic commands (`hostname`, `id`) report the intended node and root.
- Direct executor requests from a workspace fail; a caller without the right identity fails even if reachable.
- The SSH key is not in any Kubernetes Secret or container image; a changed host key fails the command.
- The executor pod runs with `hostNetwork: false`; only cluster-helper reaches its API port.
- Duplicate requests, service restarts and interrupted connections never cause automatic reexecution.

## Result

Design recorded only. No executor or cluster configuration deployed.

## Confirmed execution decisions

- Run approved commands as root on all Kubernetes nodes without exceptions.
- One privileged executor on hetzner (`hostPID: true`, `nsenter` into the host) reaches the
  other nodes over SSH with the existing key of hetzner's root; no DaemonSet (2026-11-20).
- Reuse the request expiry/TTL field; cap approval validity at 10 minutes from request
  creation, honoring shorter requested TTLs. Check expiry again before execution;
  approval must not extend validity. Execution timeout remains a separate field.
- Fail immediately when the selected node is unreachable; no offline queue
  or automatic execution when the node returns. Connection failure detection is bounded.
- Use existing cluster logging and its retention for operational/audit history.
  Do not build a separate history database, history UI or long-term output archive.
- Persist only operational state required for pending approvals, execution status,
  result delivery and duplicate prevention across restarts. This is execution safety
  state, not a separate historical record. Retain deduplication state through the
  request's replay-validity window and reject expired requests even after cleanup.
- Log structured request IDs, node, approval decision, execution status and exit code
  under existing logging conventions. Do not log full request bodies or indiscriminately
  copy commands/output that may contain secrets into logs.
