# 2026-11-15 — Telegram-approved node commands

Allow LLM workspaces to request commands on Kubernetes nodes with explicit user approval.

## Goal

One request, one command, one result. Cluster helper asks the user in Telegram with
Approve / Reject buttons before dispatching a command to the chosen node.

## Context

- Reuse cluster-helper for approval and orchestration; expose a client through a skill
  in the LLM workspace / code-tools environment.
- Run a lightweight node executor as a DaemonSet on every intended cluster node,
  including the control plane with appropriate tolerations.
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

1. Finalize authentication and certificate lifecycle. Proposed: mutual TLS with a
   dedicated private CA, managed by cert-manager; certificate issuance/renewal,
   trust distribution, exact helper identity authorization, per-node server identity,
   certificate reload and CA rotation need explicit implementation design.
   This is a proposal, not an approved dependency or deployed configuration.
2. Implement persistent request/approval state. Only the authorized Telegram user
   can approve; rejection returns `USER_REJECTED`, expiry `APPROVAL_EXPIRED`.
3. Implement authenticated executor dispatch and host command execution with bounded
   runtime/output and stdout, stderr and exit code results.
4. Persist execution IDs before starting a command so duplicate dispatch cannot rerun
   it after restart. Unknown execution outcomes must not trigger automatic retries.
5. Add the workspace client/skill and narrowly scoped network access to cluster-helper.

## Verification

- No command starts before approval; rejection, expiry and wrong-user callbacks do not execute.
- Telegram displays node, exact command, context, action description and expected outcome.
- Long explanatory text is not rejected or truncated by a new 128-character code limit.
- Approved diagnostic commands report the intended node host environment and return output/exit code.
- Direct executor requests from a workspace fail; missing/wrong mTLS identity fails even if reachable.
- Executors use `hostNetwork: false`; control-plane and worker routing select the intended node.
- Duplicate requests, service restarts and interrupted connections never cause automatic reexecution.
- Certificate renewal is consumed by running services; CA rotation has a tested trust-overlap procedure.

## Result

Design recorded only. No executor, certificate infrastructure or cluster configuration deployed.
Authentication lifecycle remains to be agreed.
