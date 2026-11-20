# 2026-11-15 — Telegram-approved node commands

- [ ] Allow LLM workspaces to request commands on Kubernetes nodes with explicit user approval.

## Goal

One request, one command, one result. Cluster helper asks the user in Telegram with
Approve / Reject buttons before running a command on the chosen node.

## Context

- Decision (2026-11-20): one executor on the control plane reaches every node over SSH.
  No DaemonSet and no per-node executor. Every approved command runs as root anyway, so a
  privileged pod on every node adds no safety; it only adds a host-root entry point per node.
- The executor is a small pod pinned to hetzner, separate from cluster-helper, which faces
  Telegram. It runs `ssh root@<node> -- <command>` over the tailnet, by Tailscale hostname.
- The SSH private key is the sensitive part: it is root on every node. Only an `ssh-agent`
  sidecar mounts it, as in
  [`_ssh-agent.tpl`](../../provisioning/helm/senaev-com/templates/llm-workspace/_ssh-agent.tpl);
  the executor container gets only the agent socket.
- Each node gets the public key in root's `authorized_keys`, restricted with
  `from="<hetzner tailnet addresses>"` and `no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty`.
  Today nodes accept only the user's own key (`terraform/server.tf`); nothing provisions
  node-to-node SSH. Adding the key touches every node, including the home nodes: one node
  at a time, with user approval, per [AGENTS.md](../../AGENTS.md).
- Pin the host keys of the nodes in a `known_hosts` the executor mounts; no
  `StrictHostKeyChecking=no` and no trust on first use.
- Open: reaching tailnet addresses from the pod network on hetzner is not verified.
  If it does not work, fall back to `hostNetwork: true` for this one pod (the earlier
  `hostNetwork: false` decision was for executors on every node) or a jump through the
  hetzner host. Use `hostNetwork: true` only after the workspace-denial check (Verification)
  shows that the CNI still enforces the executor NetworkPolicy for it: some network plugins
  treat a host-network pod as node traffic that a `podSelector` does not match. If it does
  not, the pod needs another isolation control before it gets the key (to be chosen).
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
- LLM workspaces must not hold executor credentials, the SSH key or direct access to the executor.
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

1. Verify from a test pod on hetzner that the pod network reaches the tailnet addresses
   of the nodes over SSH (read-only check, run by the user).
2. Decide the cluster-helper → executor authentication (see Context).
3. Generate the executor SSH key; store it as a Kubernetes secret. Collect the host keys.
   Add the restricted public key to root on each node, one node at a time.
4. Implement persistent request/approval state in cluster-helper. Only the authorized
   Telegram user can approve; rejection returns `USER_REJECTED`, expiry `APPROVAL_EXPIRED`.
5. Implement the executor: authenticated API, SSH through the agent socket, bounded
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
- The SSH key is readable only in the `ssh-agent` container; the key is refused from any
  address other than hetzner; a changed host key fails the command.
- Duplicate requests, service restarts and interrupted connections never cause automatic reexecution.

## Result

Design recorded only. No executor, SSH key or cluster configuration deployed.

## Confirmed execution decisions

- Run approved commands as root on all Kubernetes nodes without exceptions.
- One executor on hetzner reaches the nodes over SSH; no DaemonSet (2026-11-20).
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
