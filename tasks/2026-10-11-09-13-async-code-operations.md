# 2026-10-11 — Asynchronous code operations

## Goal

Introduce one shared managed-operation wrapper for all domain commands in both backend consumers: Code Tools (code-tools in the opencode-serve container) and Obsidian Sync (obsidian-sync in its own container). Cluster Helper (cluster-helper) remains the authenticated MCP entry point and proxies requests to the originating backend. The server returns a final result within a fixed 5-second observation window or a retrievable operation ID; ChatGPT can retrieve state, incremental logs and the final result or cancel execution without selecting an execution mode. Implementation proceeds in separate reviewed and verified stages.

## Context

- Both `code-tools/` and `obsidian-sync/` consume the shared wrapper from `senaev-utils/`, owning separate execution queues and in-memory operation state in their respective containers. Code Tools manages repositories and shell processes; Obsidian Sync manages vault filesystem commands. `cluster-helper/` exposes both through the authenticated MCP connector and routes launch and control requests to the correct backend. Existing shared definitions live in `senaev-utils/src/codeTools/` and `senaev-utils/src/obsidianVaultTools/`.
- `runTool.ts` and `cloneTool.ts` await `runProcess.ts`. Results and bounded output arrive only after completion. The proxy allows up to 330 seconds; the current process runtime limit is at most 300 seconds.
- `runProcess.ts` already uses asynchronous Node spawn, separate process groups and closed stdin. It stores bounded stdout/stderr in memory and kills the process group on timeout. It has no operation registry or later result retrieval.
- `handleMcpMessage.ts` implements stateless JSON responses using protocol version 2025-06-18, without task methods or notification streams.
- code-tools shares the opencode-serve container. Container restarts terminate its processes; repository storage is persistent.
- Background execution does not itself guarantee that ChatGPT receives a push notification or resumes a completed conversation.

## Confirmed requirements

- Preserve the current authenticated MCP connection and project-scoped development workflow. The external API may be redesigned; backwards compatibility is not required.
- Wrap every existing Code Tools and Obsidian domain command in the same managed-operation interface, including short reads and mutations. Status, result retrieval, discovery and cancellation are control-plane commands served directly outside the execution queue.
- The server always decides whether to return a final result or an operation handle. Do not expose mode, sync, async or equivalent execution-mode arguments to ChatGPT.
- When the executor is free, start the operation and observe it for at most a fixed 5 seconds: return the final result or error if it finishes, otherwise return its ID and current state (normally running). When busy, enqueue and immediately return its ID with state queued, without waiting 5 seconds. Acceptance is not command success; validation/admission errors are explicit, and subsequent execution failures remain retrievable.
- The observation wait is fixed at 5 seconds and is not configurable through tool arguments. Do not expose `waitSeconds` or another equivalent override. A follow-up observation may wait up to the same fixed 5 seconds for new output or a state change, returning sooner when either occurs.
- `timeoutSeconds` is optional and accepts a positive integer number of seconds with no API maximum. When omitted, the execution timeout is 60 seconds. When supplied, the server enforces the deadline independently of observation calls or client connectivity. Apply this contract to every domain command. Start the runtime deadline only on transition to running; queue waiting never consumes the execution timeout. Remove existing per-tool maximum runtime limits. Handle long durations using deadline-based/chunked timers so the platform timer range cannot cause an early timeout.
- On execution timeout or cancellation, stop the whole process group; preserve logs and report the reason. Prefer SIGTERM followed by SIGKILL after a bounded grace period. Define whether the grace period is additional to the runtime limit.
- No PTY, interactive terminal sessions or stdin interaction in this iteration.
- No second LLM, coding agent or model API key is required.

## Proposed design

### Operation lifecycle and API

Use every existing domain command as a launch entry point with the same server-controlled response behaviour, execution timeout and requestId contract. Add observation, cancellation and owner-scoped discovery of recent operations; final names and schemas remain to be specified.

Use a stable opaque operation ID rather than an OS PID. Return machine-readable state, creation/start/update timestamps, effective timeout, operation type and project, plus a suggested polling interval. Distinguish queued, accepted/starting, running, completed, failed, cancelled, timed out and interrupted execution. Define a single consistent mapping between operation state, launch errors, nonzero exit codes and MCP tool errors. Dependent work must wait for successful completion, not merely launch acknowledgement.

Observation returns current state, a bounded page of new stdout/stderr, a continuation cursor, truncation/retention metadata and the original final tool result when available. Explicit cursors must be replayable: reading must not consume output globally. Preserve stream identity; do not claim exact chronological ordering between independent stdout and stderr streams. Do not infer command-stage completion or a progress percentage from arbitrary log text.

### Execution and in-memory state

Use the shared small operation manager in both code-tools and obsidian-sync, each with independent queue and backend-owned state. Store all operation metadata, queue entries, requestId deduplication, final results and bounded logs exclusively in process memory. Do not use disk, a database, remote storage or any asynchronous storage adapter for operation state. This restriction does not prohibit the filesystem work explicitly requested by domain tools.

Register a retrievable operation in memory before returning its ID. Deduplicate launch retries using a caller-provided request ID and reject reuse with different arguments while its record remains retained in the same process. Keep up to 100 terminal records, 128,000 log characters per operation and 1,000,000 serialized JSON result characters per operation, with seven-day retention. Store completed results as JSON strings rather than object graphs. The retained text payload is approximately 215 MiB at two bytes per character, leaving headroom toward the roughly 256 MiB target for retained operation data. This is not a process RSS or execution-peak cap; no additional global memory or queue limits are introduced. Expire old records and release completed handler closures. Close cancels queued work, aborts active work, waits for cooperative cleanup and releases retained records.

Client disconnection must not terminate execution. A backend restart loses all IDs, queue entries, logs, results and deduplication records. Old IDs return not_found; do not reconstruct, recover or automatically replay operations. A requestId submitted after restart is a new request and can repeat side effects, so clients must inspect domain state before retrying mutations. Filesystem changes already performed remain; loss of operation state is not rollback. Continued subprocess execution across container restart is not promised.

Use one FIFO queue per backend pod, independently for Code Tools and Obsidian: one running domain operation and at most five waiting operations, across all projects and tool types. Long operations block short reads in that backend; this is an accepted first-version limitation. Serialize admission and slot assignment to enforce these limits under concurrent requests. When all five waiting slots are occupied, return the machine-readable error QUEUE_FULL without creating an operation. Deduplicate an existing requestId before capacity checks; retries must return the original operation, while reuse with different arguments fails. Status, result retrieval, discovery and cancellation bypass the queue.

A queued operation is retrievable before its ID is returned and can be cancelled without executing its handler; remove it from the waiting queue and preserve its cancelled record. After cancelling a running operation, release the execution slot and start the next operation only after processing/subprocess termination and resource cleanup finish. Record queuedAt and startedAt separately; waiting has no execution deadline. Queued work is lost on restart and is never automatically replayed. Per-pod serialization does not protect shared files against additional replicas or external writers, including the Telegram agent; document that limitation.

Clone into a reserved temporary destination and expose the final project only after success. Prevent concurrent clones into the same destination; handle failed or interrupted temporary clones without deleting unrelated directories. Replace quiet cloning with bounded progress output where practical.

### Shared cancellation and Obsidian operations

The owner explicitly added Obsidian to the design scope. Put reusable operation lifecycle, ID generation, observation contracts and cancellation utilities in senaev-utils; code-tools and obsidian-sync own their execution and in-memory state. cluster-helper routes operation requests to the originating backend using an explicit backend discriminator or an unambiguous opaque handle. Enforce the same authenticated-owner access on launch, observation, discovery and cancellation.

All existing Obsidian commands use the shared wrapper, including search, links, list, read, create, patch, diary_append and move. Every existing Code Tools command uses it as well. All handler/helper chains support cancellation propagation; short reads and edits have no exemption.

Create an AbortController for each managed operation. Pass its AbortSignal through tool handlers and shared helpers, including filesystem traversal, note reading, search, backlink scans, batch loops and subprocess supervision. Manual cancellation and execution timeout abort the same controller, with distinguishable reasons. Use the agreed default 60-second timeout and optional positive-integer override without an API maximum. Do not create independent nested deadlines that silently shorten the caller's operation timeout.

- Check signal.throwIfAborted() before starting work and between files, directory entries, batches and execution stages. Pass the signal to Node APIs that support it; for APIs that do not, check before and after awaiting and stop scheduling further work. An already pending non-abortable I/O operation may still finish.
- Make CPU-heavy loops yield periodically so timers and cancellation requests can run; a synchronous loop that never yields cannot provide timely cancellation. Bound parallel batches and prevent new work after abort.
- Do not swallow AbortError in generic per-file error handlers or report it as an unreadable-file warning. Propagate cancellation to the operation boundary, where it becomes cancelled or timed_out rather than success or an unrelated internal error.
- For shell operations, connect the abort signal to termination of the entire process group, with bounded graceful shutdown and escalation. Retain available output in memory and settle the operation exactly once despite exit/abort races.
- For TypeScript operations, stop cooperative processing, close iterators/file handles and release locks/listeners/timers. Return preserved progress where meaningful, without claiming a complete result.
- Before irreversible writes or atomic publication, check the signal. Preserve per-file atomicity and existing hash/conflict checks. Cancellation cannot undo completed writes: report changed paths and partial completion for move/link rewrites and other multi-file mutations. Never claim automatic rollback unless it is explicitly implemented.
- Remove cancellation listeners and deadline timers after terminal completion. Keep the last known consistent in-memory state. Abort must not be caused merely by a disconnected observation request; operation execution belongs to its lifecycle, not to a poll's HTTP connection.

Review every existing code-* and obsidian-* handler and its helper chain, recording coverage in tests. Native filesystem AbortSignal support does not guarantee interruption of every kernel I/O call; acceptance tests must cover cooperative traversal and bounded scheduling rather than promise instantaneous cancellation of all I/O.

### Timeouts and notifications

Execution timeout enforcement belongs to the server, not to ChatGPT polling. A Node timer handles ordinary hung commands; if guarantees against a blocked or failed backend event loop are required, use an independent watchdog and document its failure boundary. Launch and HTTP observation timeouts must include margin above the fixed 5-second wait and bounded admission overhead. No HTTP request waits for the complete execution beyond that window; operation runtime deadlines are independent of proxy limits.

Ordinary MCP tool calls with operation polling are the compatible initial path. Native MCP Tasks can be an adapter over the same operation manager if the actual ChatGPT client advertises and correctly handles the relevant capability. Do not substitute an unsupported protocol result shape for CallToolResult.

Push notifications are optional follow-up work, gated on confirmed client support. Protocol notifications, user-visible notifications and automatic model continuation are separate capabilities. Do not promise any of them without an end-to-end test. Polling remains sufficient to retrieve results and logs.

### Universal tool coverage

All Code Tools domain commands (run, clone, search, projects, list, read, write and patch) and all Obsidian domain commands use the same wrapper, queue, IDs, server-controlled response behaviour, deadlines and observation utilities. Preserve each tool's original structured final result; short commands return it during the initial observation window. No read-only exemption or per-project execution slot is introduced.

Retain bounded search/list results in memory for subsequent retrieval rather than rerunning the same operation. Saved results are snapshots and must not be presented as current after filesystem changes. Typed tools return structured results rather than raw process logs. Cancellation/deadline checks cover JavaScript processing as well as subprocesses.

### Gradual activation and recovery access

Universal coverage is the final target, not a single deployment switch. Activate the shared wrapper through a backend-owned allowlist/feature flag, initially for only one read-only command (code-projects is the first candidate). Commands outside the allowlist keep their existing direct path during migration; they do not enter the new queue or depend on manager availability. Keep the control endpoints outside the queue and ensure tool descriptions match the actually enabled behaviour.

Before enabling another group, merge its separate PR, verify the deployment and exercise the enabled command end-to-end through ChatGPT: fast result, long-running handle, queued response, status/result, cancellation, timeout and backend recovery. Use controlled test fixtures/delays to test slow read-only behaviour without altering real repositories. Verify that code-run/read/write/patch still work while the new manager is unavailable, its queue is full or an operation is hung.

Migrate read-only commands first, then mutations, and switch the commands used to repair this repository last. Before that final switch, establish and test a recovery path independent of this MCP (for example SSH/kubectl with a documented last-known-good image rollback). A flag reachable only through the broken MCP is not a recovery path. Disabling managed execution must reject new managed admissions, reconcile in-flight work and preserve retrievable results; never automatically retry mutations on the old path. Do not advance while rollout/health/smoke checks fail. A shared process crash or blocked event loop can still affect direct tools; the initial allowlist reduces exposure but does not replace independent recovery access.

## Questions and clarifications

- Final operation tool names and schemas; whether observation combines status, logs and result in one response.
- Termination grace period, log/result quotas and retention. Queue capacity is settled: one running and five waiting operations per backend pod. The execution default is 60 seconds; the API must not impose an upper bound.
- Whether a Node timer is sufficient or an independent watchdog is required.
- Backend-aware operation routing and in-memory operation ownership for obsidian-sync.
- Cancellation checkpoints, yield/batch sizes and partial-write reporting for every existing handler. All domain tools expose the same managed interface.
- Which native MCP Tasks revision, if any, the deployed ChatGPT client supports. Older 2025-11-25 Tasks and the current Tasks extension have different contracts.

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
3. Implement the reusable operation lifecycle in senaev-utils, backend-owned in-memory operations and routing, process supervision, runtime deadlines and cancellation.
4. Thread AbortSignal through every existing Code Tools and Obsidian handler/helper chain; make file traversal and batch/CPU processing cooperatively cancellable.
5. Add a backend-owned activation allowlist and wrap one safe read-only command first (code-projects). Keep all other commands on their existing direct path; validate the complete managed lifecycle before expanding coverage.
6. Add independent per-backend FIFO queues (one running, five waiting), immediate queued acknowledgement, QUEUE_FULL, retention, clone publication and loss of state on restart.
7. Preserve each wrapped tool's structured results, conflict/diff feedback and partial-mutation reporting.
8. Expand coverage in separate PRs after merge/deployment/smoke checks: read-only tools, mutations, then recovery-critical run/read/write/patch after independent rollback access is verified. Update shared tool definitions, proxy policies and operating instructions for each enabled stage.
9. Run automated checks and end-to-end tests from the current ChatGPT connector before any rollout claims.

## Verification

- On an idle executor, every domain command returns its final result or error if it finishes within the fixed 5-second observation window; otherwise it returns an operation ID and current state within that window plus bounded overhead. A busy executor immediately returns queued without observing execution. Test completion racing with the observation deadline and retain a retrievable coherent outcome.
- Omitted timeout enforces the 60-second default. An explicit positive-integer timeout overrides it and terminates a hung command without any observation calls. Values above the old 300-second limit, including 10800 seconds (3 hours), are accepted. Test long deadlines without waiting in real time and ensure platform timer overflow cannot produce immediate termination. Cancel and timeout kill descendant processes and preserve partial logs.
- Invalid launch, fast nonzero exit, successful completion, timeout, cancellation and interruption remain distinguishable.
- Poll while running, read new output by cursor and replay the same cursor; verify bounded output and retained stderr for fast failures.
- Disconnect and reconnect the client; verify retrieval with the same ID and owner-scoped discovery in a new chat.
- Duplicate request IDs do not run a command twice, including retries when the queue is full; conflicting arguments fail. Dependent commands wait for successful completion. Clone destinations follow the documented limits.
- For each backend, verify exactly one running operation and at most five waiting, FIFO admission, immediate queued responses without the initial 5-second wait, and QUEUE_FULL without a new operation record. Code Tools and Obsidian execute independently.
- Queue waiting does not consume the default or explicit runtime timeout. Verify queued cancellation never invokes the handler; running cancellation holds the slot until cleanup completes. Status/result/cancel remain available while execution and queue slots are occupied.
- Restart the container: all operation state is lost, old IDs return not_found and no work is replayed. Deduplication applies only while the record exists in the same process. Verify the manager does not read or write operation state through any storage API.
- Verify that no tool schema exposes execution-mode arguments (mode/sync/async), configurable observation waiting or PTY functionality.
- For every existing handler, verify an already-aborted signal prevents new work. Test mid-traversal/mid-batch abort, timeout without polls, listener/timer/lock cleanup and cancellation propagation through helpers.
- Verify aborted search/backlink scans stop scheduling reads and cannot return complete:true or swallow abort as an ordinary file warning. Verify CPU loops yield and parallel batches stop scheduling work.
- Verify cancelled multi-file mutations preserve valid individual files and report completed changes and incomplete work. Test abort racing with final completion/publication and ensure a single coherent terminal outcome.
- Verify backend routing and owner isolation for both Code Tools and Obsidian operation handles; client poll disconnection must not abort execution.
- Test disabled-command bypass when the manager is unavailable, its queue is full or an operation is hung; verify run/read/write/patch remain available during migration. Verify safe feature-flag rollback without duplicate mutations and test independent recovery access before the final switch.
- Run all repository checks and verify each merged deployment before expanding the activation allowlist; ultimately demonstrate run, clone and a long Obsidian scan through ChatGPT.

## Findings

### 2026-10-11 09:13 UTC — Prepare design for owner review

Inspected the current execution and proxy code and reviewed primary-source async MCP and command-tool patterns. The owner confirmed mode selection, a fixed non-configurable 5-second observation wait, and no PTY. The initially discussed 60-second execution default was superseded by the clarification below. Created this file at the owner's explicit request. This branch contains documentation only; implementation has not started.

### 2026-10-11 09:16 UTC — Clarify execution timeout

The owner explicitly replaced the timeout defaults and maximum: timeoutSeconds is optional, with no product-defined maximum; omission means no execution deadline. This applies to both run and clone. The fixed 5-second observation wait remains unchanged. Existing code currently uses 60 seconds by default and a 300-second maximum for run, and a fixed 300 seconds for clone. These are current-state facts, not requirements for the new API.

### 2026-10-11 09:18 UTC — Final timeout clarification and additional candidates

The owner superseded the preceding no-default decision: omitted timeoutSeconds means 60 seconds; an explicit value is any positive integer without an API maximum. The current requirements and verification above reflect this final decision. Reviewed search, projects and list implementations and recorded their suitability for managed execution; read/write/patch remain direct initially.

### 2026-10-11 09:26 UTC — Extend scope to Obsidian and cooperative cancellation

The owner requested shared async infrastructure for Obsidian and AbortController support throughout all existing commands. Added a common AbortSignal contract, cooperative filesystem traversal and CPU/batch checkpoints, abort propagation, subprocess termination, resource cleanup and explicit partial-mutation behaviour. Updated the plan and verification. This remains a documentation-only PR; no implementation changed.

### 2026-10-11 09:37 UTC — Universal wrapper and per-backend FIFO queues

The owner superseded the earlier tool exceptions and per-project concurrency proposal: all domain commands use one managed wrapper. Each backend pod independently permits one running operation and five FIFO waiting operations; a busy executor returns a queued ID immediately, and a full waiting queue returns QUEUE_FULL without creating an operation. Runtime timeout starts only at running and excludes all queue waiting. Control-plane calls bypass the queue; queued cancellation removes waiting work, and running cancellation releases the slot only after cleanup. Long operations blocking short reads are accepted for the first version. Retained requestId deduplication and dependent-command completion requirements. Updated operative requirements, plan and verification; historical findings above remain as the decision log. No implementation changed.

### 2026-10-11 09:50 UTC — Remove execution modes and clarify both consumers

The owner removed caller-selected sync/async/auto modes. All domain tools now use server-controlled bounded observation: an idle executor returns a result/error within 5 seconds or an operation ID; a busy executor immediately returns a queued ID. Updated operative requirements, proxy policy, plan and verification, removing obsolete sync transport questions. Explicitly named both Code Tools and Obsidian Sync containers as consumers of the shared senaev-utils wrapper, with Cluster Helper routing to their independent queues and state. Earlier mode decisions remain historical only. This PR still changes documentation only.

### 2026-10-11 10:08 UTC — Stage 1: shared manager, separate PRs

Merged the reviewed design PR #61 into main (f1038eb). The owner requested a separate PR from main for each implementation stage, followed by deployment verification before advancing. Stage 1 lives on feat/operation-manager and adds the inactive shared manager and cancellation context only; existing backend routes and MCP schemas remain unchanged. Implemented serialized FIFO admission (one active/five waiting), QUEUE_FULL, requestId deduplication, bounded initial observation, runtime-only chunked deadlines, cancellation, atomic persistent records, replayable bounded logs, paged result retrieval and interrupted restart recovery. Initial storage policy: 128,000 log characters, 4,000,000 result characters, 100 terminal records and seven-day retention, pruning at admission/completion. Log snapshots flush every 250 ms and at terminal completion; an abrupt crash can lose the last unflushed output. Cooperative cancellation checkpoints use an async-local operation context to propagate the same AbortSignal through helper chains. Stage 1 does not activate execution or change production behaviour. Clone removal/generalized Run remains a separate Obsidian reminder, outside this implementation.

### 2026-10-11 10:40 UTC — Gradual activation requirement

The owner approved merging stage 1 and requested gradual activation to protect the MCP used to edit and repair this repository. Added an initial read-only canary, backend-owned activation allowlist, independent direct-path bypass, separate merge/deploy/verification gates, recovery-critical tools last and tested out-of-band rollback before universal activation. The final universal interface remains the goal; migration exceptions are temporary. The allowlist itself is a small integration change; lifecycle, failure and rollout verification is the larger part of the work.

### 2026-10-11 10:46 UTC — Stage 1 merge and CI timing correction

Merged PR #62 into main (58108bd) with the gradual activation requirement. Local checks passed on retry; the first local run hit an existing calendar-test timeout. Post-merge GitHub CI then exposed a timing-sensitive helper in two new manager tests: 1,000 immediate event-loop turns can expire before filesystem completion on a fast runner with slower storage. Deployment was blocked by CI and production behaviour stayed unchanged. Prepared a follow-up fix using a three-second wall-clock polling deadline with a 10 ms pause; no production code change. Do not advance to activation until the corrected CI and deployments succeed.

### 2026-10-11 10:53 UTC — Stage 1 verified after deployment

Merged the CI polling correction as PR #63 (main 0c1e293). All six workflows for this commit succeeded: opencode-serve, cluster-helper, obsidian-sync, media-server-helper, vpn-subscription and senaev-utils. Confirmed live MCP code-projects, code-read and code-run, plus Obsidian read. HTTP smoke checks returned the expected 302 redirect to https://senaev.com/cv/5min and 200 for the static HTML and public note. Code Tools was briefly unavailable during its restart and recovered. Stage 1 is complete; the manager is still inactive. Prepared feat/managed-projects-canary from this verified main for the next separate PR, initially enabling only projects. No canary implementation or activation had started at this point.

### 2026-10-11 11:02 UTC — Separate stage: memory-only operation state

The owner superseded all persistence and restart-recovery requirements. Removed disk records, initialization/recovery I/O and log-flush timers in a separate PR before activating projects. Operation state and requestId deduplication are process-local and bounded; restart loses all handles, logs, results and queued work, without replay. Historical findings remain the decision log. This stage does not activate the manager or change existing MCP routes.

Removed all operation-state filesystem imports, persistence/recovery methods and log-flush timers. Retained bounded process-local records, replayable cursors, result paging, queue limits, deadlines and cancellation. Close discards queued callbacks, cooperatively aborts active execution and clears retained records. Updated tests for fresh-instance loss of IDs/deduplication, backend isolation, shutdown and retention. Targeted manager suite: 12 passed. Full npm run simple-checks: all six checks passed; 133 test files and 1,106 tests passed. Separate branch: refactor/in-memory-operations. Canary activation remains deferred until this stage is merged and deployment verified.

### 2026-10-11 11:06 UTC — Reduce retained memory toward 256 MiB

The owner requested a roughly 256 MiB retained-data target without introducing additional limits. Reduced the existing result quota from 4,000,000 to 1,000,000 JSON characters per operation; kept 100 terminal records, 128,000 log characters, seven-day retention and one active/five waiting operations. Store completed results as JSON strings to avoid unbounded object-graph overhead in retained records and parse only when returning a small result or the initial final reply. Estimated retained text: about 215 MiB at two bytes per character, plus metadata and transient response overhead. This does not bound Node process RSS or memory used by executing handlers. Targeted manager suite: 13 tests passed, including the exact result boundary, rejection above it and snapshot independence from later mutation.

### 2026-10-11 11:34 UTC — Stage 2: projects canary and authenticated controls

Merged PR #64 into main (89822f0). All six main workflows succeeded. After brief restart-time MCP/HTTP unavailability, Code Tools projects/read/run and Obsidian read worked; public smoke checks recovered to the expected 302 redirect and two 200 responses. Created feat/projects-operation-canary from that verified main.

Activated only projects through a shared typed canary allowlist. Other Code Tools domain routes remain direct and do not construct or admit through the memory-only manager. Added authenticated operations, operation_status, operation_result and operation_cancel endpoints and matching MCP definitions; discovery and observation/cancellation bypass FIFO. projects accepts timeoutSeconds/requestId without execution modes or wait overrides. The proxy gives managed launch/control requests 15 seconds for the fixed five-second observation window plus transport margin; legacy routes retain their existing 330-second HTTP budget.

Added cooperative directory/project checkpoints and bounded sequential project scheduling. Managed runGit uses the operation signal and log sink rather than its legacy 30-second nested deadline. Abort terminates the entire Git process group with SIGTERM, then SIGKILL after up to one additional second, and waits for stream/process cleanup. Project description waits for all sibling Git calls before releasing the operation slot; generic per-project/remote error handling cannot swallow abort. Server shutdown closes the manager with a ten-second process-level fallback. Obsidian integration and other domain activation remain later stages.

Targeted validation: nine files, 67 tests passed, including real Fastify HTTP client disconnection, fast results, five-second handles, immediate queued responses/QUEUE_FULL, replayable logs, runtime-only timeout, cancellation, restart loss, request deduplication, control authentication/validation and repair-route bypass under full/failing admission. Fake Git fixtures verify abort before traversal, mid-project abort propagation, whole-group escalation and no scheduling of later projects. Updated MCP discovery/proxy/schema tests; no production delay knobs or real repository changes are used to exercise slow behaviour.

### 2026-10-11 11:36 UTC — Stage 2 full validation

Full npm run simple-checks passed: lint, TypeScript for all packages, tests, Python, shell and Helm checks all exited 0. Test output: "Test Files 137 passed (137)" and "Tests 1125 passed (1125)". The pre-push hook also completed and commit 03b8c37 reached the remote branch. Opened PR #65; GitHub Check and CodeRabbit both passed on that commit. Do not expand the allowlist until this PR is merged, its deployment passes and the actual connector is exercised.

### 2026-10-11 11:44 UTC — Restore the complete task log

Final PR review exposed truncated MCP reads of this long file. Restored the previous memory-stage log from the complete main blob and the missing stage verification/decision entries from the session record, then appended the canary findings. Operative requirements and implementation are unchanged. Read long files in pages before replacing them; never treat truncated content as the whole file. This follow-up changes documentation only.

### 2026-10-11 11:56 UTC — PR #65 merged and deployed MCP canary checked

Merged https://github.com/senaev/infra.senaev.com/pull/65 into main at `102ac595d9b1f53ef728afc2bea4b1a839becbed`; pulled main. All six main service workflows succeeded, including rollout status. Public smoke checks passed: short link 302 to https://senaev.com/cv/5min, static page 200, public note 200.

Actual ChatGPT MCP calls against deployed services:
- Fast projects: completed operation `code-dcf42497-a6d6-49a8-a096-9c116699c676`, backend runtime about 138 ms, client 705 ms.
- Temporary isolated Git repository with a 12-second fsmonitor hook: projects returned `code-befedb93-daa1-4bdc-bf46-52f7d058049e`, state `running`, after 5547 ms including network overhead.
- Five subsequent requests returned distinct queued IDs in 511–617 ms; `startedAt: null`.
- Sixth waiting request returned exactly: `{"status":"error","code":"QUEUE_FULL","message":"Five operations are already waiting; retry after a slot is free"}`; MCP `isError: true`, 514 ms. Connector also adds `error_code: INVALID_ARGUMENT` to the structured error.
- Legacy code-run worked while the managed queue was full (disabled the temporary hook in 12 ms). This preserves recovery access during the canary stage.
- After the first operation finished and queued requests drained, a fresh projects call completed in about 60 ms backend runtime. Temporary probe repository was removed; production repository Git configuration was untouched.

Limitation: this chat still exposes the old MCP tool catalogue, without code-operations/status/result/cancel and without the new projects arguments. Read-only plugin-management discovery offers no catalogue refresh operation. Therefore cancellation, result/log polling, requestId and custom runtime timeout were NOT verified through this live ChatGPT connector; automated coverage passed before merge, but deployed end-to-end verification of those controls remains pending a refreshed connector catalogue. Do not roll out additional managed commands before that check.

### 2026-10-11 12:45 UTC — Refreshed connector: deployed canary verification completed

The refreshed ChatGPT catalogue exposes code-operations, code-operation_status, code-operation_result and code-operation_cancel, plus projects requestId/timeoutSeconds. All were exercised through the actual MCP connector; no internal bearer extraction or alternate authentication path.

- Fast projects completed in about 71 ms backend runtime with default timeoutSeconds 60. Repeat requestId returned the same ID and retained snapshot; changed arguments returned conflict.
- Historical running/queued IDs from the earlier live probe are all completed. operation_result retrieved their final project snapshot and stdout/stderr logs, closing the prior tracking gap.
- Isolated temporary Git fsmonitor probe: 30-second work returned running after 5528 ms. Status/log observation bypassed the execution queue. Cursor 0 replayed the same six entries; cursor 6 returned no repeated entries.
- Queued cancellation: code-056f20a0-f60b-4ada-ad7d-5c487b5d66e2 became cancelled with startedAt null, no logs, despite waiting over six seconds with timeoutSeconds 1. It never executed.
- Running cancellation: code-6cdc13db-cd87-4ac1-be80-949fc1a5e1c4 initially remained running during cleanup, then cancelled. Repeated cancellation was safe.
- Runtime deadline without polling: code-4c5c42bb-2db7-4790-b01b-52904a12bfc8 with timeoutSeconds 1 timed out in about 1007 ms backend runtime and released the slot. operation_result retained the timed_out error and logs.
- Long natural completion: code-0996ffe8-48b7-4685-b3f2-edeac22f8818 accepted timeoutSeconds 10800 (above the legacy API cap), returned running after 5496 ms and completed after about 12 seconds. operation_result returned its final snapshot.
- Runtime-only deadline: code-d3b57b20-eb8b-47b5-aa4a-c1a4c4a5d10b waited 6458 ms in the queue with timeoutSeconds 1, then completed in 36 ms. Queue waiting did not consume its deadline.
- Legacy code-run remained usable to disable the probe while managed work was running/queued. /proc cmdline inspection found no remaining canary hook/sleep subprocesses after abort/timeout and completion.
- Removed only the guarded temporary probe repository. Existing production repositories/configuration unchanged. No implementation edits needed.

Together with the earlier five-waiter/QUEUE_FULL test and passing automated integration/manager suites, the deployed projects canary gate is verified. Large result pagination, retention limits and forced backend restart remain covered by automated tests; no disruptive production restart was performed for this check. Next stage can expand the managed allowlist incrementally while retaining repair access.

### 2026-10-11 12:54 UTC — Stage 3: activate managed code-run

Created feat/async-code-run from verified main. Expanded only the shared managed allowlist from projects to projects/run, reusing the same backend FIFO, IDs, requestId deduplication, 5-second observation and control endpoints. read/write/patch and remaining tools stay direct for repair access. run now uses the operation AbortSignal and log sink; managed execution has no nested process deadline. Shared executionTimeout defaults to 60 seconds and accepts positive finite integer values without an API upper cap. Removed stale run timeout cap from schema/limits/proxy; managed run uses the existing 15-second observation transport budget. Direct process deadline helper now uses chunked scheduling to avoid Node timer overflow.

Retain the manager's existing classification: nonzero shell exitCode is a normal command result (status ok, stdout/stderr/exitCode retained) with terminal operation state failed; exceptions also become failed, cancellation/deadline become cancelled/timed_out. Updated tool description accordingly. Initial integration test exposed this existing classification and was corrected without changing manager semantics.

Targeted suite passed: six files, 38 tests. Real subprocess tests cover streaming/replay cursors, one mutation despite duplicate requestId, conflicting retries, queued cancellation without execution, TERM-resistant group termination, slot held for cleanup, shared projects/run queue, runtime expiry without polling, recovery after expiry, output limits and invalid parameters. Added direct long-deadline overflow regression. Full validation pending pre-push. After merge/deploy, test real MCP fast/slow run, polling/result, cancel/timeout and repair access before expanding further.

### 2026-10-11 12:59 UTC — Stage 3 validation

Full pre-push validation passed: ESLint, TypeScript, 138 Vitest files / 1134 tests, Helm, shell and Python checks. The first full run exposed an outdated projects-only contract assertion; it now verifies both managed tools and keeps repair tools outside the queue. Branch feat/async-code-run is pushed. Live code-run checks are reserved for after merge and deployment.

### 2026-10-11 13:09 UTC — Stage 3 merged and verified live

PR #69 merged into main as 32445b0028b468ecfac6a03573da420e8e5477c7; working checkout is main. All six deployment workflows succeeded. Actual MCP calls verified immediate run completion; a 12-second run returned a running ID, exposed stdout/stderr before completion, then retained exitCode 7 with state failed; queued run cancellation retained startedAt=null; running TERM-resistant process-group cancellation reached cancelled; timeoutSeconds=1 reached timed_out after approximately two seconds including SIGKILL grace without polling. A subsequent run completed normally, and /proc contained no remaining sleep 30/50 test processes. No test fixture files were created. Read/write/patch remain direct for repair access. The current ChatGPT tool catalogue still describes the old run timeout cap and lacks requestId; refreshing tool definitions is needed to expose those new arguments, while the deployed asynchronous flow already works.

### 2026-10-11 13:39 UTC — Refreshed run catalogue and Stage 4

The actual ChatGPT catalogue now exposes run requestId and the uncapped execution timeout. Two calls with requestId catalogue-check-20261011-1335 returned the same operation code-ef9610fa-9e58-4fac-b4f6-fbedec259790 and UUID output, confirming retained deduplication; timeoutSeconds 10800 was accepted. Started feat/async-code-search-list from main for the next separate PR. Enable only list/search with common observation, queue, timeouts and controls; add cancellation checkpoints to subprocesses, result parsing and file metadata traversal. Keep read/write/patch and clone direct during this stage.

### 2026-10-11 13:45 UTC — Stage 4 implementation and targeted validation

Expanded the shared allowlist and MCP schemas to projects/run/list/search. Proxy policy automatically applies the existing 15-second managed observation budget. Search uses the operation signal/log sink instead of a nested deadline, with cooperative checkpoints while parsing JSON events, counting matches and formatting snippets. List uses checkpoints during path filtering/grouping and sequential metadata reads; abort is never swallowed by file-stat fallback. listProjectFiles now waits for both sibling Git subprocesses to settle before releasing the operation slot. File repair and clone remain direct.

Targeted output: "Test Files 5 passed (5)" / "Tests 31 passed (31)". New HTTP/handler tests exercise real result retention, no-match success, regex failure, requestId deduplication, shared queue admission, queued cancellation without invoking search, runtime excluding queue time, TERM-resistant subprocess deadlines, sibling Git cleanup, already-aborted handlers, mid-JSON parsing abort and metadata traversal abort. Full pre-push checks are the next gate. No production activation occurs before this stage is reviewed and merged.

### 2026-10-11 13:47 UTC — Full-check corrections

The first pre-push run blocked publication: one generic test callback needed an explicit unknown result type, and an existing HTTP-error test still used list as a direct route. Kept that test on direct read and added an explicit managed list not_found/failed assertion: accepted operations retain execution errors rather than exposing them as direct-route HTTP 404. Production logic was unchanged by these test corrections. Lint and all syntax checks passed; repeat the complete validation before opening the PR.

### 2026-10-11 13:49 UTC — Stage 4 full validation passed

All pre-push checks passed: lint, TypeScript, Python, shell, Helm and Vitest. Verbatim summary: "Test Files 139 passed (139)" and "Tests 1140 passed (1140)". Branch feat/async-code-search-list is pushed. This stage is ready for a separate review PR; live search/list verification remains the post-merge/deployment gate.
