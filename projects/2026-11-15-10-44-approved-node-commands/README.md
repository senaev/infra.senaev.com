# 2026-11-15 — Telegram-approved node commands

Allow LLM workspaces to request commands on Kubernetes nodes with explicit user approval.

## Goal

One request, one command, one result. Cluster helper asks the user in Telegram with
Approve / Reject buttons before dispatching a command to the chosen node.

## Context

- Reuse cluster-helper for approval and orchestration; expose a client through a skill
  in the LLM workspace / code-tools environment.
- Run a lightweight node executor as a DaemonSet on every cluster node without exceptions,
  including the control plane with appropriate tolerations. Approved commands run as host root.
- Executors need host access to execute in the node operating system, rather than
  just inside their containers. Determine the exact namespace/mount setup during implementation.
- Decision: `hostNetwork: false`. The executor API stays in the pod network, even
  when its command subprocess enters host namespaces. No public Ingress or host port.
- Restrict executor API ingress with NetworkPolicy to cluster-helper's namespace,
  pod identity selectors and API port. Verify actual network-plugin enforcement;
  NetworkPolicy has local-node exceptions and is not authentication.
- LLM workspaces must not hold executor credentials or direct host-execution access.
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

1. Reuse the [inter-service certificate authentication project](../2026-11-15-11-00-inter-service-certificate-authentication/README.md)
   for mutual TLS and certificate lifecycle. Require exact helper authorization and
   node-specific executor server identity. Implement the shared foundation first.
2. Implement persistent request/approval state. Only the authorized Telegram user
   can approve; rejection returns `USER_REJECTED`, expiry `APPROVAL_EXPIRED`.
3. Implement authenticated executor dispatch and host command execution with bounded
   runtime/output and stdout, stderr and exit code results.
4. Persist execution IDs before starting a command so duplicate dispatch cannot rerun
   it after restart. Unknown execution outcomes must not trigger automatic retries.
5. Add the workspace client/skill and narrowly scoped network access to cluster-helper.

## Verification

- No command starts before approval; rejection, expiry and wrong-user callbacks do not execute.
- Approval validity never exceeds 10 minutes; shorter TTLs are honored and late approvals fail.
- Unavailable nodes fail without queuing; commands execute as host root on every cluster node.
- Existing cluster logs expose execution events; no separate history store is introduced.
- Telegram displays node, exact command, context, action description and expected outcome.
- Long explanatory text is not rejected or truncated by a new 128-character code limit.
- Approved diagnostic commands report the intended node host environment and return output/exit code.
- Direct executor requests from a workspace fail; missing/wrong mTLS identity fails even if reachable.
- Executors use `hostNetwork: false`; control-plane and worker routing select the intended node.
- Duplicate requests, service restarts and interrupted connections never cause automatic reexecution.
- Certificate renewal is consumed by running services; CA rotation has a tested trust-overlap procedure.

## Result

Design recorded only. No executor, certificate infrastructure or cluster configuration deployed.
Authentication lifecycle is tracked in the linked certificate project.

## Confirmed execution decisions

- Run approved commands as root on all Kubernetes nodes without exceptions.
- Reuse the request expiry/TTL field; cap approval validity at 10 minutes from request
  creation, honoring shorter requested TTLs. Check expiry again before execution;
  approval must not extend validity. Execution timeout remains a separate field.
- Fail immediately when the selected node/executor is unavailable; no offline queue
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
