# 2026-10-11 — Asynchronous code operations

## Goal

Replace the blocking long-command workflow in the existing Code Tools MCP with managed operations and extend the shared mechanism to Obsidian tools. ChatGPT chooses synchronous, asynchronous or automatic execution, receives a reliable launch acknowledgement, and can retrieve state, incremental logs and the final result or cancel execution. This PR documents the design only; implementation starts after the owner reviews it.

## Context

- Existing tools are in `code-tools/`; `cluster-helper/` exposes and proxies them through the authenticated MCP connector. Shared definitions live in `senaev-utils/src/codeTools/`.
- `runTool.ts` and `cloneTool.ts` await `runProcess.ts`. Results and bounded output arrive only after completion. The proxy allows up to 330 seconds; the current process runtime limit is at most 300 seconds.
- `runProcess.ts` already uses asynchronous Node spawn, separate process groups and closed stdin. It stores bounded stdout/stderr in memory and kills the process group on timeout. It has no operation registry or later result retrieval.
- `handleMcpMessage.ts` implements stateless JSON responses using protocol version 2025-06-18, without task methods or notification streams.
- code-tools shares the opencode-serve container. Container restarts terminate its processes; repository storage is persistent.
- Background execution does not itself guarantee that ChatGPT receives a push notification or resumes a completed conversation.

## Confirmed requirements

- Preserve the current authenticated MCP connection and project-scoped development workflow. The external API may be redesigned; backwards compatibility is not required.
- Apply managed execution to shell commands and repository cloning, and support the same lifecycle for long-running Code Tools and Obsidian operations. Short file tools may stay direct but must participate in the common cancellation/deadline contract.
- Let ChatGPT select `mode: sync | async | auto`; default to `auto`.
- In `async`, acknowledge a successfully launched operation promptly with its ID. Validation and launch failures must be explicit; acceptance must not be reported as command success.
- In `sync`, wait for the terminal result within the execution timeout.
- In `auto`, wait up to a fixed 5 seconds: return the final result if finished, otherwise return the operation ID and current state. The process continues after that response.
- The observation wait is fixed at 5 seconds and is not configurable through tool arguments. Do not expose `waitSeconds` or another equivalent override. A follow-up observation may wait up to the same fixed 5 seconds for new output or a state change, returning sooner when either occurs.
- `timeoutSeconds` is optional and accepts a positive integer number of seconds with no API maximum. When omitted, the execution timeout is 60 seconds. When supplied, the server enforces the deadline independently of mode, observation calls or client connectivity. Apply this contract to both run and clone; use a 60-second default for both and remove the existing maximum runtime limit. Handle long durations using deadline-based/chunked timers so the platform timer range cannot cause an early timeout.
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

### Shared cancellation and Obsidian operations

The owner explicitly added Obsidian to the design scope. Put reusable operation lifecycle, ID generation, observation contracts and cancellation utilities in senaev-utils; code-tools and obsidian-sync own their execution and persistent state. cluster-helper routes operation requests to the originating backend using an explicit backend discriminator or an unambiguous opaque handle. Enforce the same authenticated-owner access on launch, observation, discovery and cancellation.

Obsidian search (whole-vault search), links (backlink scanning), recursive list, large diary reads and move (link rewrites) are candidates for managed async execution. Keep ordinary short reads and edits direct where appropriate. All existing commands in both services must support cancellation propagation, regardless of whether they initially expose async mode; this includes create, patch and diary_append as well as read-only tools. Async exposure and AbortSignal support are separate requirements.

Create an AbortController for each managed operation or direct tool invocation. Pass its AbortSignal through tool handlers and shared helpers, including filesystem traversal, note reading, search, backlink scans, batch loops and subprocess supervision. Manual cancellation and execution timeout abort the same controller, with distinguishable reasons. Use the agreed default 60-second timeout and optional positive-integer override without an API maximum. Do not create independent nested deadlines that silently shorten the caller's operation timeout.

- Check signal.throwIfAborted() before starting work and between files, directory entries, batches and execution stages. Pass the signal to Node APIs that support it; for APIs that do not, check before and after awaiting and stop scheduling further work. An already pending non-abortable I/O operation may still finish.
- Make CPU-heavy loops yield periodically so timers and cancellation requests can run; a synchronous loop that never yields cannot provide timely cancellation. Bound parallel batches and prevent new work after abort.
- Do not swallow AbortError in generic per-file error handlers or report it as an unreadable-file warning. Propagate cancellation to the operation boundary, where it becomes cancelled or timed_out rather than success or an unrelated internal error.
- For shell operations, connect the abort signal to termination of the entire process group, with bounded graceful shutdown and escalation. Drain/persist available output and settle the operation exactly once despite exit/abort races.
- For TypeScript operations, stop cooperative processing, close iterators/file handles and release locks/listeners/timers. Return preserved progress where meaningful, without claiming a complete result.
- Before irreversible writes or atomic publication, check the signal. Preserve per-file atomicity and existing hash/conflict checks. Cancellation cannot undo completed writes: report changed paths and partial completion for move/link rewrites and other multi-file mutations. Never claim automatic rollback unless it is explicitly implemented.
- Remove cancellation listeners and deadline timers after terminal completion. Keep the last known consistent persisted state. Abort must not be caused merely by a disconnected observation request; operation execution belongs to its lifecycle, not to a poll's HTTP connection.

Review every existing code-* and obsidian-* handler and its helper chain, recording coverage in tests. Native filesystem AbortSignal support does not guarantee interruption of every kernel I/O call; acceptance tests must cover cooperative traversal and bounded scheduling rather than promise instantaneous cancellation of all I/O.

### Timeouts and notifications

Execution timeout enforcement belongs to the server, not to ChatGPT polling. A Node timer handles ordinary hung commands; if guarantees against a blocked or failed code-tools event loop are required, use an independent watchdog and document its failure boundary. HTTP observation timeout must include margin above the fixed 5-second wait; synchronous calls require a separate compatible proxy policy.

Ordinary MCP tool calls with operation polling are the compatible initial path. Native MCP Tasks can be an adapter over the same operation manager if the actual ChatGPT client advertises and correctly handles the relevant capability. Do not substitute an unsupported protocol result shape for CallToolResult.

Push notifications are optional follow-up work, gated on confirmed client support. Protocol notifications, user-visible notifications and automatic model continuation are separate capabilities. Do not promise any of them without an end-to-end test. Polling remains sufficient to retrieve results and logs.

### Other existing tools: scope assessment

| Tool | Existing execution | Recommendation |
| --- | --- | --- |
| run | Arbitrary bash command | Required in the first implementation. |
| clone | git clone and branch discovery | Required in the first implementation. |
| search | ripgrep over repository files, with a fixed 30-second deadline; each page repeats the search | Strong next candidate. Reuse managed operations, persist one bounded structured result and page through that result without rerunning the search. Distinguish incomplete/truncated results from complete results. |
| projects | Parallel Git branch/status/remote calls for every repository; git status can be expensive | Candidate for auto execution when observation exceeds 5 seconds. First consider bounded concurrency and cheaper discovery; do not require background execution for ordinary small project lists. |
| list | Two git ls-files calls collect the whole repository before folder filtering and pagination | Candidate for large repositories. First reduce the work where practical; reuse operation snapshots if async listing is added. |
| read | Bounded reads and hashes of selected text files | Keep direct in the first iteration. |
| write / patch | Bounded edits with hash checks and atomic writes | Keep direct in the first iteration to preserve immediate conflict/diff feedback. |

Build the operation manager so additional tool types can reuse it. These candidates are an assessment, not automatic scope expansion: run and clone remain mandatory; confirm inclusion of search/projects/list with the owner. Read-only operations should not take the exclusive shell-operation slot. A saved search/list result is a snapshot and must not be presented as current after repository changes. Typed tools return structured results, not raw process logs. Their cancellation/deadline checks must cover the complete operation, including JavaScript processing, rather than only subprocess execution.

## Questions and clarifications

- Final operation tool names and schemas; whether observation combines status, logs and result in one response.
- Termination grace period, log quotas, retention and global concurrency limit. The execution default is 60 seconds; the API must not impose an upper bound.
- Persistent state directory and restart reconciliation details.
- Whether a Node timer is sufficient or an independent watchdog is required.
- Backend-aware operation routing and persistent state configuration for obsidian-sync.
- Cancellation checkpoints, yield/batch sizes and partial-write reporting for every existing handler; which Obsidian tools expose async mode initially.
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
3. Implement the reusable operation lifecycle in senaev-utils, backend-owned persistent operations and routing, process supervision, runtime deadlines and cancellation.
4. Thread AbortSignal through every existing Code Tools and Obsidian handler/helper chain; make file traversal and batch/CPU processing cooperatively cancellable.
5. Integrate run/clone modes, fixed observation waiting, incremental output and retry deduplication.
6. Add retention, concurrency controls, clone publication and restart reconciliation.
7. Integrate selected long-running Obsidian tools and preserve structured results and partial-mutation reporting.
8. Update shared tool definitions, proxy policies and operating instructions.
9. Run automated checks and end-to-end tests from the current ChatGPT connector before any rollout claims.

## Verification

- Short auto command returns its final result; long auto command returns an ID within the fixed 5-second observation window plus bounded overhead.
- Async returns a launch acknowledgement without waiting for completion; sync returns the final result.
- Omitted timeout enforces the 60-second default. An explicit positive-integer timeout overrides it and terminates a hung command without any observation calls. Values above the old 300-second limit, including 10800 seconds (3 hours), are accepted. Test long deadlines without waiting in real time and ensure platform timer overflow cannot produce immediate termination. Cancel and timeout kill descendant processes and preserve partial logs.
- Invalid launch, fast nonzero exit, successful completion, timeout, cancellation and interruption remain distinguishable.
- Poll while running, read new output by cursor and replay the same cursor; verify bounded output and retained stderr for fast failures.
- Disconnect and reconnect the client; verify retrieval with the same ID and owner-scoped discovery in a new chat.
- Duplicate request IDs do not run a command twice; conflicting arguments fail. Concurrent operations and clone destinations follow the documented limits.
- Restart the container: completed results survive and unfinished work becomes interrupted, without automatic reruns or indefinite running states.
- Verify that no tool schema exposes configurable observation waiting or PTY functionality.
- For every existing handler, verify an already-aborted signal prevents new work. Test mid-traversal/mid-batch abort, timeout without polls, listener/timer/lock cleanup and cancellation propagation through helpers.
- Verify aborted search/backlink scans stop scheduling reads and cannot return complete:true or swallow abort as an ordinary file warning. Verify CPU loops yield and parallel batches stop scheduling work.
- Verify cancelled multi-file mutations preserve valid individual files and report completed changes and incomplete work. Test abort racing with final completion/publication and ensure a single coherent terminal outcome.
- Verify backend routing and owner isolation for both Code Tools and Obsidian operation handles; client poll disconnection must not abort execution.
- Run all repository checks; demonstrate run, clone and a long Obsidian scan through ChatGPT.

## Findings

### 2026-10-11 09:13 UTC — Prepare design for owner review

Inspected the current execution and proxy code and reviewed primary-source async MCP and command-tool patterns. The owner confirmed mode selection, a fixed non-configurable 5-second observation wait, and no PTY. The initially discussed 60-second execution default was superseded by the clarification below. Created this file at the owner's explicit request. This branch contains documentation only; implementation has not started.

### 2026-10-11 09:16 UTC — Clarify execution timeout

The owner explicitly replaced the timeout defaults and maximum: timeoutSeconds is optional, with no product-defined maximum; omission means no execution deadline. This applies to both run and clone. The fixed 5-second observation wait remains unchanged. Existing code currently uses 60 seconds by default and a 300-second maximum for run, and a fixed 300 seconds for clone. These are current-state facts, not requirements for the new API.

### 2026-10-11 09:18 UTC — Final timeout clarification and additional candidates

The owner superseded the preceding no-default decision: omitted timeoutSeconds means 60 seconds; an explicit value is any positive integer without an API maximum. The current requirements and verification above reflect this final decision. Reviewed search, projects and list implementations and recorded their suitability for managed execution; read/write/patch remain direct initially.

### 2026-10-11 09:26 UTC — Extend scope to Obsidian and cooperative cancellation

The owner requested shared async infrastructure for Obsidian and AbortController support throughout all existing commands. Added a common AbortSignal contract, cooperative filesystem traversal and CPU/batch checkpoints, abort propagation, subprocess termination, resource cleanup and explicit partial-mutation behaviour. Updated the plan and verification. This remains a documentation-only PR; no implementation changed.
