# 2026-11-15 — Telegram-approved node commands

- [ ] Allow LLM workspaces to request commands on Kubernetes nodes with explicit user approval.

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
  - The nodes are not listed in the chart: the executor reads their `vps` labels with
    hetzner's `k3s kubectl get nodes` for every command (2026-11-27). A host that is
    not a cluster node is refused, so a node that joins or leaves needs no change.
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
  `DELETE /executions/:id` creates a stop marker on the host and runs `systemctl stop` on the unit by its name, derived from the execution ID; a unit that starts after the marker exits without running the command.
- SSH can also reach machines outside Kubernetes, such as the `proxmox-madrid` host.
  Which hosts the executor accepts is an explicit list in its configuration.
- Restrict executor API ingress with NetworkPolicy to cluster-helper's pod and the API port.
  No public Ingress or host port. NetworkPolicy is not authentication.
- Decision (2026-11-22): cluster-helper → executor is mTLS, with the internal CA that is now
  in `main` (see "Internal mTLS" in [AGENTS.md](../../AGENTS.md)). node-shell allows only
  `cluster-helper.senaev-com.svc.cluster.local`; it has no plain port.
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

## Asynchronous API

Approval can take up to 10 minutes plus the command runtime, longer than the timeouts of
MCP clients (ChatGPT connectors), proxies and some harnesses. So no call waits for the
approval or the command:

- `submit` saves the request, posts it to Telegram and returns `requestId` at once,
  with status `pending_approval`.
- `status(requestId, wait?)` reads the saved state: `pending_approval`, `running`,
  `completed` (stdout, stderr, exit code), `USER_REJECTED`, `APPROVAL_EXPIRED` or
  `failed` (for example, node unreachable). With `wait` (at most 25 seconds), it holds
  the call until the status changes or `wait` ends, so the agent polls rarely.
- `status` only reads; it never starts, retries or approves anything. Calling it any
  number of times, from any reconnect, is safe.
- Only the cluster-helper client that submitted a request can read its status.
- Keep a final result for 1 hour after it is reached, then delete it; `status` then
  returns `not_found`. This is result delivery state, not history.
- The skill tells agents to submit once, then poll `status` with `wait` until a final
  status. Same pattern as the code tools operations
  ([`OperationManager.ts`](../../senaev-utils/src/operations/OperationManager.ts),
  [async code operations](../2026-10-11-09-13-async-code-operations/README.md)), but
  with persistent state, so a restart of cluster-helper keeps the result.

## Plan

1. Check on hetzner, as root, that SSH reaches every node non-interactively and that
   `known_hosts` has their keys (read-only, run by the user):
   `ssh -o BatchMode=yes -o StrictHostKeyChecking=yes root@<node> hostname`.
2. ~~Decide the cluster-helper → executor authentication~~: mTLS (2026-11-22).
3. Check from a test pod with `privileged: true` and `hostPID: true` on hetzner that
   `nsenter -t 1 -a -- hostname` and `nsenter -t 1 -a -- ssh ... root@<node> hostname` work.
4. Implement persistent request/approval state in cluster-helper, with the asynchronous
   `submit` / `status` API (see Asynchronous API). Only the authorized
   Telegram user can approve; rejection returns `USER_REJECTED`, expiry `APPROVAL_EXPIRED`.
   The `requestId` is also the execution ID: a request runs at most once, so it needs no other
   ID. It uses the execution ID format of node-shell (`[A-Za-z0-9-]`, at most 64 characters).
   node-shell keeps its execution IDs only in memory: after a restart, or 24 hours after the
   end, it does not know an ID, and a `PUT` with it runs the command again. So cluster-helper
   sends the `PUT` of a request once, and never again when it got no answer: that outcome is
   reported as unknown, never resent. It saves that it sent the `PUT` before sending it.
5. **Done in [`node-shell/`](../../node-shell/) (not deployed yet).** Implement the executor: authenticated API, `nsenter` into the hetzner host, then SSH; bounded
   output, runtime bounded on the node by the systemd unit (see Context);
   returns stdout, stderr and exit code.
6. ~~Persist execution IDs in node-shell~~: dropped on 2026-11-28. node-shell keeps them in
   memory; cluster-helper prevents a second run (step 4). Unknown execution outcomes must not
   trigger automatic retries.
7. Add the workspace client/skill (submit, then poll `status` with `wait`) and narrowly
   scoped network access to cluster-helper.

## Verification

- No command starts before approval; rejection, expiry and wrong-user callbacks do not execute.
- Approval validity never exceeds 10 minutes; shorter TTLs are honored and late approvals fail.
- An unreachable node fails without queuing: when the TCP connection gives up (about 2 minutes), or at the command's deadline if that is sooner.
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
- `submit` returns `requestId` in under a second while approval is pending; no call stays
  open longer than the `wait` limit.
- After a 5-minute wait for approval, polling `status` returns the result; a cluster-helper
  restart between approval and the poll does not lose it.
- Another client cannot read a request's status; after 1 hour a final result returns `not_found`.

## Result

The executor is implemented as `node-shell` (steps 3 and 5; see
"Node shell" in [AGENTS.md](../../AGENTS.md)). Its API, `PUT` / `GET /executions/:executionId`, is
already asynchronous: `PUT` answers at once. Executions are kept in memory only: a restart
forgets them, and a command that still runs goes on by itself on its host. Not deployed or verified on the cluster yet. Still to do: the Telegram approval with the
`submit` / `status` API in cluster-helper (step 4), and the workspace skill (step 7).

## Confirmed execution decisions

- Run approved commands as root on all Kubernetes nodes without exceptions.
- Asynchronous API: `submit` returns `requestId` at once; agents poll `status` (2026-11-20).
- The `requestId` is the execution ID of node-shell. A request never runs again, and it is
  fine that the ID exists before the approval (2026-11-28).
- One privileged executor on hetzner (`hostPID: true`, `nsenter` into the host) reaches the
  other nodes over SSH with the existing key of hetzner's root; no DaemonSet (2026-11-20).
- Reuse the request expiry/TTL field; cap approval validity at 10 minutes from request
  creation, honoring shorter requested TTLs. Check expiry again before execution;
  approval must not extend validity. Execution timeout remains a separate field.
- Fail immediately when the selected node is unreachable; no offline queue
  or automatic execution when the node returns. Connection failure detection is bounded by the TCP connect timeout and the command's deadline.
- Use existing cluster logging and its retention for operational/audit history.
  Do not build a separate history database, history UI or long-term output archive.
- node-shell keeps no state across restarts (2026-11-28): after a restart it forgets every
  execution, and a command that still runs goes on by itself on its host. cluster-helper
  alone keeps what prevents a second run.
- Persist only operational state required for pending approvals, execution status,
  result delivery and duplicate prevention across restarts. This is execution safety
  state, not a separate historical record. Retain deduplication state through the
  request's replay-validity window and reject expired requests even after cleanup.
- Log structured request IDs, node, approval decision, execution status and exit code
  under existing logging conventions. Do not log full request bodies or indiscriminately
  copy commands/output that may contain secrets into logs.
