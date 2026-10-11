# 2026-10-11 — Asynchronous code operations

## Goal

Replace the blocking long-command workflow in the existing Code Tools MCP with managed operations. ChatGPT chooses synchronous, asynchronous or automatic execution, receives a reliable launch acknowledgement, and can retrieve state, incremental logs and the final result or cancel execution. This PR documents the design only; implementation starts after the owner reviews it.

## Context

- Existing tools are in `code-tools/`; `cluster-helper/` exposes and proxies them through the authenticated MCP connector. Shared definitions live in `senaev-utils/src/codeTools/`.
- `runTool.ts` and `cloneTool.ts` await `runProcess.ts`. Results and bounded output arrive only after completion. The proxy allows up to 330 seconds; the current process runtime limit is at most 300 seconds.
- `runProcess.ts` already uses asynchronous Node spawn, separate process groups and closed stdin. It stores bounded stdout/stderr in memory and kills the process group on timeout. It has no operation registry or later result retrieval.
- `handleMcpMessage.ts` implements stateless JSON responses using protocol version 2025-06-18, without task methods or notification streams.
- code-tools shares the opencode-serve container. Container restarts terminate its processes; repository storage is persistent.
- Background execution does not itself guarantee that ChatGPT receives a push notification or resumes a completed conversation.

## Confirmed requirements

- Preserve the current authenticated MCP connection and project-scoped development workflow. The external API may be redesigned; backwards compatibility is not required.
- Apply managed execution to shell commands and repository cloning. Keep ordinary file tools direct.
- Let ChatGPT select `mode: sync | async | auto`; default to `auto`.
- In `async`, acknowledge a successfully launched operation promptly with its ID. Validation and launch failures must be explicit; acceptance must not be reported as command success.
- In `sync`, wait for the terminal result within the execution timeout.
- In `auto`, wait up to a fixed 5 seconds: return the final result if finished, otherwise return the operation ID and current state. The process continues after that response.
- The observation wait is fixed at 5 seconds and is not configurable through tool arguments. Do not expose `waitSeconds` or another equivalent override. A follow-up observation may wait up to the same fixed 5 seconds for new output or a state change, returning sooner when either occurs.
- `timeoutSeconds` remains configurable by ChatGPT, defaults to 60 seconds, and limits actual execution independently of mode, observation calls or client connectivity. Specify a finite server-enforced maximum during implementation.
- On execution timeout or cancellation, stop the whole process group; preserve logs and report the reason. Prefer SIGTERM followed by SIGKILL after a bounded grace period. Define whether the grace period is additional to the runtime limit.
- No PTY, interactive terminal sessions or stdin interaction in this iteration.
- No second LLM, coding agent or model API key is required.

## Proposed design

### Operation lifecycle and API

Keep `code-run` and `code-clone` as launch entry points, adding the mode and execution timeout to both. Add observation, cancellation and owner-scoped discovery of recent operations; final names and schemas remain to be specified.

Use a stable opaque operation ID rather than an OS PID. Return machine-readable state, creation/start/update timestamps, effective timeout, operation type and project, plus a suggested polling interval. Distinguish accepted/starting, running, completed, failed, cancelled, timed out and interrupted execution. Define a single consistent mapping between operation state, launch errors, nonzero exit codes and MCP tool errors. Dependent work must wait for successful completion, not merely launch acknowledgement.

Observation returns current state, a bounded page of new stdout/stderr, a continuation cursor, truncation/retention metadata and the original final tool result when available. Explicit cursors must be replayable: reading must not consume output globally. Preserve stream identity; do not claim exact chronological ordering between independent stdout and stderr streams. Do not infer command-stage completion or a progress percentage from arbitrary log text.

### Execution, storage and recovery

Use a small operation manager inside code-tools. Persist metadata, final results and bounded logs on persistent storage outside repository working trees; a database or distributed queue is not initially necessary for the single-instance deployment. Set retention, output quotas and concurrent-operation limits.

Persist a retrievable operation before returning its ID. Deduplicate launch retries using a caller-provided request ID and reject reuse with different arguments. Do not automatically rerun arbitrary shell commands after crashes: they may already have produced side effects.

Client disconnection must not terminate execution. Persisted results and logs must survive service/container restart. Continued execution across container restart is not a requirement for this iteration: record unfinished operations as interrupted rather than leaving them running forever or reporting success. Do not claim that `detached: true` alone provides restart durability. Guard against PID reuse when recovering state or cancelling processes.

Start with one active shell operation per project and an explicit conflict response for another launch; independent projects may execute concurrently within a global limit. Observation and cancellation remain available. This does not prevent external writers, including the Telegram agent, from changing a checkout; document that limitation.

Clone into a reserved temporary destination and expose the final project only after success. Prevent concurrent clones into the same destination; handle failed or interrupted temporary clones without deleting unrelated directories. Replace quiet cloning with bounded progress output where practical.

### Timeouts and notifications

Execution timeout enforcement belongs to the server, not to ChatGPT polling. A Node timer handles ordinary hung commands; if guarantees against a blocked or failed code-tools event loop are required, use an independent watchdog and document its failure boundary. HTTP observation timeout must include margin above the fixed 5-second wait; synchronous calls require a separate compatible proxy policy.

Ordinary MCP tool calls with operation polling are the compatible initial path. Native MCP Tasks can be an adapter over the same operation manager if the actual ChatGPT client advertises and correctly handles the relevant capability. Do not substitute an unsupported protocol result shape for CallToolResult.

Push notifications are optional follow-up work, gated on confirmed client support. Protocol notifications, user-visible notifications and automatic model continuation are separate capabilities. Do not promise any of them without an end-to-end test. Polling remains sufficient to retrieve results and logs.

## Questions and clarifications

- Final operation tool names and schemas; whether observation combines status, logs and result in one response.
- Maximum execution timeout, termination grace period, log quotas, retention and global concurrency limit.
- Persistent state directory and restart reconciliation details.
- Whether a Node timer is sufficient or an independent watchdog is required.
- Which native MCP Tasks revision, if any, the deployed ChatGPT client supports. Older 2025-11-25 Tasks and the current Tasks extension have different contracts.
- Expected behaviour of sync mode when the requested runtime exceeds client/proxy limits; recommend auto/async and enforce a known safe sync ceiling rather than silently changing mode.

## Research references

- [MCP Tasks overview](https://modelcontextprotocol.io/extensions/tasks/overview) — durable handles, polling, client capability opt-in and optional subscriptions.
- [Current Tasks specification](https://github.com/modelcontextprotocol/ext-tasks/blob/main/specification/draft/tasks.md) — use the version current at implementation, not a mixture of old/new task contracts.
- [Node child processes](https://nodejs.org/api/child_process.html#optionsdetached) — process groups and the limits of detached execution.
- [Codex command execution](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs) — bounded initial waiting and continued process observation.
- [Desktop Commander tools](https://github.com/wonderwhy-er/DesktopCommanderMCP/blob/main/src/server.ts) — separate process launch and bounded incremental output retrieval.

These are design references, not adopted dependencies or proof of ChatGPT client support.

## Plan

1. Review this task with the owner and settle the open API and lifecycle decisions.
2. Verify actual ChatGPT capabilities and choose the external polling interface; keep native Tasks optional.
3. Implement persistent operations, process supervision, runtime deadlines and cancellation.
4. Integrate run/clone modes, fixed observation waiting, incremental output and retry deduplication.
5. Add retention, concurrency controls, clone publication and restart reconciliation.
6. Update shared tool definitions, proxy policies and operating instructions.
7. Run automated checks and end-to-end tests from the current ChatGPT connector before any rollout claims.

## Verification

- Short auto command returns its final result; long auto command returns an ID within the fixed 5-second observation window plus bounded overhead.
- Async returns a launch acknowledgement without waiting for completion; sync returns the final result.
- Default 60-second execution timeout terminates a hung command without any observation calls. A longer explicit timeout works within the server maximum. Cancel and timeout kill descendant processes and preserve partial logs.
- Invalid launch, fast nonzero exit, successful completion, timeout, cancellation and interruption remain distinguishable.
- Poll while running, read new output by cursor and replay the same cursor; verify bounded output and retained stderr for fast failures.
- Disconnect and reconnect the client; verify retrieval with the same ID and owner-scoped discovery in a new chat.
- Duplicate request IDs do not run a command twice; conflicting arguments fail. Concurrent operations and clone destinations follow the documented limits.
- Restart the container: completed results survive and unfinished work becomes interrupted, without automatic reruns or indefinite running states.
- Verify that no tool schema exposes configurable observation waiting or PTY functionality.
- Run all repository checks; demonstrate the flow with npm run simple-checks and a repository clone through ChatGPT.

## Findings

### 2026-10-11 09:13 UTC — Prepare design for owner review

Inspected the current execution and proxy code and reviewed primary-source async MCP and command-tool patterns. The owner confirmed mode selection, a configurable execution timeout with a 60-second default, a fixed non-configurable 5-second observation wait, and no PTY. Created this file at the owner's explicit request. This branch contains documentation only; implementation has not started.
