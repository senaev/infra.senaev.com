# 2026-10-10 — Remote project editing via MCP

## Description

Enable voice-driven development from the [[ChatGPT]] app on [[Android]] using the owner's existing authenticated MCP plugin running on his server. ChatGPT itself should inspect and edit remote repository files, run commands, verify changes and optionally prepare commits and pull requests.

This document captures the discussion of 8 October 2026 and hands implementation over to the owner. Documentation is complete; implementation is not started. Follow [[tasks/AGENTS]] when continuing.

### Confirmed requirements

- Use the current ChatGPT conversation and subscription as the reasoning engine.
- Dictate messages as in the existing mobile workflow; ChatGPT transcribes the request and calls MCP tools.
- Preserve the existing working MCP connection and authentication.
- No separate server-side coding agent, separate model inference API key, or additional coding-agent billing is required by the selected architecture.
- Operate directly on the remote server's filesystem and installed development tools.
- Support reading, searching, patching files, commands, [[Git]], branches, commits and potentially [[GitHub]] pull requests.
- Support multiple projects with understandable names and explicit project selection.
- The owner will continue independently after receiving this document.

### Selected architecture

Android ChatGPT dictation -> existing authenticated MCP endpoint -> project-scoped filesystem, Git and command tools -> server repositories.

ChatGPT controls the read -> understand -> change -> test -> inspect loop. The MCP server executes concrete operations and returns results; it does not run another LLM.

A completed ChatGPT turn does not leave an autonomous coding agent working on the feature. An already started background command may continue independently. Background commands alone do not guarantee ChatGPT notifications or automatic continuation.

### Alternatives discussed and superseded

- [[SSH]] from a phone into [[Codex]] CLI, optionally inside tmux: rejected as the primary workflow because the owner wants the current ChatGPT chat and dictation.
- Native Remote through an online Mac/Windows host connected to the server by SSH: Android support was found in official documentation, but the permanent desktop dependency is undesirable.
- MCP dispatching complete tasks to Codex SDK/App Server: superseded by the explicit requirement to use ChatGPT itself for reasoning.
- Early research found coding-agent wrappers such as [tuannvm/codex-mcp-server](https://github.com/tuannvm/codex-mcp-server), [coding-agent-a2a](https://github.com/casabre/coding-agent-a2a) and [agent-rack](https://github.com/lakpriya1s/agent-rack). They are not the selected solution.

The owner's concern about buying a separate Codex token is recorded as a preference, not a claim that every Codex workflow requires separately purchased API usage. No Codex pricing investigation is needed for this design.

## Questions and clarifications

### Settled

- Android and dictated messages are essential.
- Existing MCP connectivity is already working; proving mobile connectivity again is outside this task.
- Direct tools are preferred over delegating work to a second coding agent.
- Recommendations below are candidates and design references, not tested or adopted dependencies.

### Open implementation decisions

- Which repositories and directories should be exposed, and under which project IDs?
- What is the existing server framework, container layout and execution user? Inspect the actual implementation before choosing integration details.
- Reuse a complete server, adapt selected tools, or implement a small tool surface in the existing plugin?
- Which commands may run, and what filesystem/network permissions should their execution environment have?
- How should concurrent edits, worktrees, command persistence, output retention and cancellation behave?
- How should Git credentials and PR creation be integrated?
- Should a new chat discover recent projects and command results from server-side state?
- Which third-party licences and dependency requirements permit the intended reuse?

A [[Typescript]] implementation would fit the owner's existing MCP work, but the exact repository and service wiring have not been inspected in this conversation.

## Research and sources

The following counts were observed on GitHub on 8 October 2026. They are historical snapshots, not current guarantees. README features were reviewed; implementations were not executed or security-audited. Author claims such as "production-ready" were not independently verified.

| Project | Stars observed | Relevant features | Fit and limitations |
| --- | ---: | --- | --- |
| [kieutrongthien/coding-mcp](https://github.com/kieutrongthien/coding-mcp) | 2 | Multiple-project registry, project_id, files, search, patches, Git, bounded commands, HTTP/stdio, API-key roles | Closest explicit multi-project model. Small project; its auth must be adapted to the existing connection if needed. |
| [escapeWu/chatgpt-web-oauth-mcp](https://github.com/escapeWu/chatgpt-web-oauth-mcp) | 1 | ChatGPT-oriented HTTP and [[OAuth]], bounded/paged reads, search, protected batch edits, Git/worktrees, durable jobs, tmux | Strong reference for direct ChatGPT tools and context-efficient output. Additional Codex facilities are separate from direct tools; evaluate only the required subset. |
| [AmirAliManzar/remote-access-mcp](https://github.com/AmirAliManzar/remote-access-mcp) | 4 | Files, shell, Git, background jobs, cancellation, output, snapshots/rollback, token-scoped access | Broad server-management toolkit. Validate transport/auth fit and actual isolation before adoption. |
| [achetronic/filesystem-mcp](https://github.com/achetronic/filesystem-mcp) | 11 | Go server, HTTP, OAuth metadata/JWT/RBAC, partial reads, batch edits, undo, commands, background process status/kill | Compact tool reference. Git can be invoked through shell; no explicit project registry was established. Shell permission bypasses its file-path restrictions. |
| [ezyang/codemcp](https://github.com/ezyang/codemcp) | Approximately 1,600 | Chat-based file editing/testing, predefined commands and Git-versioned edits | More established design reference, intended for Claude Desktop. Author labels it obsolete; not a ready recommendation for this deployment. |

Provisional assessment: inspect chatgpt-web-oauth-mcp for the direct editing/job workflow, coding-mcp for multi-project organisation, and filesystem-mcp for a compact tool surface. Prefer preserving existing transport/auth and adapting useful implementations after review. No dependency has been selected.

Official references for superseded approaches:
- [Remote connections](https://learn.chatgpt.com/docs/remote-connections)
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex MCP server removal](https://learn.chatgpt.com/docs/mcp-server)

The old built-in codex mcp-server command was reported removed in official documentation during research. App Server uses a separate protocol, not MCP; migration documentation labelled direct App Server experimental and unsupported for production workloads. These details are background only.

## Proposed MCP interface

These are suggested names and contracts, not the exact API of any listed project.

| Tool | Purpose |
| --- | --- |
| list_projects | IDs, names and short descriptions of allowed repositories |
| get_project(project_id) | Stack, current branch, working-tree status and verification commands |
| list_files(project_id, path) | Bounded directory listing |
| read_files(project_id, paths) | Batch reads with ranges, hashes and continuation metadata |
| search(project_id, query) | Bounded code search with file paths and line numbers |
| apply_patch(project_id, patch, expected_hashes) | Targeted edits with stale-content conflict detection |
| run_command(project_id, command, request_id) | Short execution or background launch returning command_id |
| get_command(command_id) | State, exit code and paged stdout/stderr |
| cancel_command(command_id) | Stop a running command |
| git_status / git_diff | Structured status and bounded diffs |
| create_branch / commit / create_pr | Explicit Git and publication operations |

### Execution principles

- Resolve project_id to server-configured roots; do not accept unrestricted project paths from the model.
- Read relevant project AGENTS.md instructions before editing.
- Use hashes or expected text to reject stale edits; report conflicts and reread instead of overwriting.
- Batch reads, limit output and provide pagination to avoid filling chat context with the whole repository.
- Return machine-readable status, actionable errors, exit codes and output truncation metadata.
- Deduplicate mutating retries through request IDs.
- Keep long commands independent of a mobile connection, with status retrieval and cancellation.
- Avoid simultaneous modifications to the same checkout; consider per-task branches/worktrees.
- Worktrees separate Git changes but do not enforce OS security boundaries. Shell access requires appropriate execution-user/container permissions.
- Preserve existing credentials without exposing secrets in results or logs.
- Keep publishing/merge/deployment capabilities explicit and consistent with the owner's requested scope.
- Return concise summaries: changed files, checks, remaining issues and PR URL when available.

### Example user workflow

The owner dictates: "In the diary project, add search by title and verify it with tests."

ChatGPT selects the project, reads its instructions, searches and reads relevant files, applies patches, runs checks, retrieves long-command results, inspects the diff and reports the outcome.

The owner can then dictate: "Also search the note contents" or "Create a pull request." New-chat continuation should retrieve actual server state rather than rely on remembered file contents.

## Plan

1. Inspect the existing MCP implementation, auth, project mounts and tool conventions.
2. Review candidate source code, licences, maintenance and compatibility; decide reuse versus adaptation.
3. Define the minimal direct tool contracts and explicit multi-project configuration.
4. Implement reads/search and conflict-protected edits first.
5. Add bounded commands, background status/cancellation and Git operations.
6. Verify end-to-end with the existing Android ChatGPT connection and dictated requests.
7. Test stale edits, duplicate calls, output truncation, invalid project IDs, concurrent operations and long-command recovery.
8. Document setup and operating instructions; add PR creation if selected.
9. Record each implementation stage here and append a final Result only when implementation is actually finished.

### Acceptance criteria

- The owner can dictate a development request in the existing Android ChatGPT chat.
- ChatGPT reads and changes the intended remote project's files through MCP.
- At least two configured repositories can be distinguished reliably.
- Tests/builds return useful status and output; long commands can be retrieved and cancelled.
- Stale edits and duplicate mutations are handled explicitly.
- Git changes can be reviewed and reverted; commits/PRs work when enabled.
- No separate coding-agent LLM is invoked by the direct editing workflow.

## 2026-10-10 18:56 — Capture discussion and prepare handoff

**To do:** Read vault/task instructions and document the requirements, research, superseded alternatives, proposed interface and implementation plan in English.

**Done:** Read root AGENTS.md and tasks/AGENTS.md. Checked tasks/ for an existing task; only its instruction file was present. Searched existing concept notes and linked confirmed matches. Consolidated the conversation into this task record. No server code, credentials or deployment were changed. No candidate was installed or tested.

**Next steps or blockers:** Owner continues independently from Plan step 1. Implementation remains open. A separately named Obsidian skill was not available in the accessible skill catalog; the vault instructions and connector tool guidance were used instead.

## Findings

### 2026-10-10 — Moved from the vault; inspected the existing code (Plan step 1)

The file was moved from `obsidian-vault/tasks/` to this repository.

**opencode pod** (`provisioning/helm/senaev-com/templates/opencode-serve.yaml`): Deployment
`opencode-telegram` on hetzner, containers `opencode-serve` (opencode on :4096, no auth) and
`opencode-telegram-bot` (talks to `localhost:4096`).
- Image `opencode-serve/Dockerfile`: Debian, git, gh, ripgrep, jq, yq, make, Node 22
  (npm not confirmed). Runs as root, no resource limits.
- Repos: PVC `opencode-telegram-git` at `/projects/git`, cloned by hand. It was probably
  emptied by the k3s rebuild (`tasks/2026-10-04-k3s-dual-stack-ipv6.md`). Vault at `/projects/vault`.
- Git: SSH key from `TELEGRAM_OPENCODE_SSH_PRIVATE_KEY` in the `ssh-dir` emptyDir, `GH_TOKEN`
  for `gh`, identity from `GIT_AUTHOR_*` / `GIT_COMMITTER_*` env.
- No Service, no NetworkPolicy: any pod can reach opencode :4096 without auth.
- `build-opencode-serve.yml` does not pass the `dockerfile` input that `build-service.yml`
  now requires, so the image build probably fails.

**Reusable code** from the Obsidian MCP tools:
- As is: the MCP handler and OAuth in cluster-helper; the internal-token hook, the
  `POST /<prefix>/:tool` route, `VaultToolError`, `toolArguments`, path and symlink checks,
  `createNoteDiff`, `hashContent` in obsidian-sync; bearer, sha256, atomic writes and
  `walkDirectory` in senaev-utils.
- With a small change: the `list`, `search`, `read`, `patch` (`replace`, `append`) and
  `create` tools — drop frontmatter, sections and diary; allow any text file; respect `.gitignore`.
- Not reusable: `links`, `diary_append`, link rewriting in `move`.

### 2026-10-10 — Decisions and the v1 plan

Decisions by the owner:
- The tool server runs **inside the existing `opencode-serve` container** as a second
  process, not as a sidecar.
- `code-run` is a **full shell** (`bash -lc`). The container is the security boundary.
- **Any repository** can be cloned into `/projects/git`.
- Work happens **in the main checkout**; no branch or worktree for each session in v1.

v1 tools, all `code-*` in the existing ChatGPT connector: `projects`, `clone`, `list`,
`search`, `read`, `patch`, `create`, `run`. Git and PRs go through `run`.

v1 plan (replaces the generic `## Plan` above for now):
1. Fix `build-opencode-serve.yml` (missing `dockerfile` input); confirm that npm works in the image.
2. Move the generic parts of obsidian-sync to senaev-utils: the tool error, argument readers,
   internal-token hook and tool route, diff, path and symlink checks.
3. Add the tool definitions `code-*` to senaev-utils, next to the vault ones.
4. New package `code-tools/`: a Fastify server on :8080 with the 8 tools; `list` and
   `search` use `git ls-files`; `read`/`patch` reuse the vault logic with line ranges and hashes;
   `run` has a timeout and capped output. Tests for each tool.
5. Image: build `code-tools` into the `opencode-serve` image; the CMD starts both processes
   and exits when one of them exits, so Kubernetes restarts the container.
6. Helm: port 8080, a liveness probe, the internal token from Vault, a Service and a
   NetworkPolicy (ingress only from cluster-helper; this also closes opencode :4096 —
   the telegram bot uses localhost, so it is not affected).
7. cluster-helper: the MCP handler serves tool families (`obsidian-*`, `code-*`), each with
   its own backend URL and token.
8. Verify from ChatGPT: clone `infra.senaev.com`, read, patch, run `npm run simple-checks`,
   commit and push to a test branch.

Needs the owner: add `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS` to Vault
`senaev-com-kv` before the deploy.

### 2026-10-10 — Package skeleton

New package `code-tools/`, the same layout as obsidian-sync: its own `package.json` and
lockfile (fastify, tsx, `senaev-utils` by path), `tsconfig.json` extends the base,
`src/env.ts` (`CODE_TOOLS_PROJECTS_PATH`, `INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS`),
`src/logger.ts`, `src/index.ts` (Fastify on :8080), `vitest.setup.ts`.
`createCodeToolsServer` has `GET /health` (no token, for the liveness probe) and requires the
internal token on every other route; 3 tests. Registered in the root `typecheck` script,
`vitest.config.mts` and `check.yml`. `npm run simple-checks` passes.
