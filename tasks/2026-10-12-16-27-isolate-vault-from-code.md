# 2026-10-12 — Isolate Obsidian Vault from code containers

## Goal

Keep Vault filesystem access in obsidian-sync only. OpenCode Serve, Code Tools MCP and the Telegram bot work with git repositories and have no Vault mount. Preserve Obsidian MCP, sync and public static/note serving. User requests separate task/branch/PR; no merge/deploy authorized yet.

## Context

Main67c0ddf, clean working tree. Current OpenCode deployment mounts Vault into both runtime containers; OPENCODE_WORKDIR=/projects/vault. Shared git PVC remains independent. cluster-helper forwards Obsidian commands over HTTP and does not mount Vault.

## Plan

1. Remove OpenCode Vault volume/mounts; switch working directory and file browser root to /projects/git.
2. Update OpenCode instructions and bot default browser root; preserve session history and data.
3. Render Helm and assert filesystem boundaries and unchanged Obsidian mount; inspect old project behavior.
4. Run mandatory checks, publish separate PR and report deployment/live verification limits.

## Verification

Before merge: rendered manifest assertions, lint/typecheck/tests/syntax/Helm checks. After explicitly authorized merge: rollout success, code-run cannot access /projects/vault, git operations still work, Obsidian MCP and public smoke URLs work. No alternative auth/internal tokens.

## Findings

### 2026-10-12T16:27:00.430505+00:00 — Read-only inspection and implementation started

Only obsidian-sync and opencode-serve template currently reference the Vault hostPath. OpenCode and Code Tools are processes in one container, with a Telegram bot sidecar sharing git PVC. CLAUDE.md includes AGENTS.md, so one instruction update suffices. Existing bot upstream main supports hiding missing folders, but deployed package version behavior must be verified rather than assumed. Do not delete project/session history.

### 2026-10-12T16:29:46.165362+00:00 — Filesystem isolation implemented and rendered checks PASS

Removed two Vault mounts and hostPath volume from OpenCode Deployment. Changed OPENCODE_WORKDIR and OPEN_BROWSER_ROOTS to /projects/git, bot fallback likewise. Removed stale Vault description in OpenCode AGENTS; CLAUDE includes that file. Root infra AGENTS documents data boundary and current Markdown-only Obsidian MCP file capability.

Pinned Telegram bot0.26.4: inspected actual npm tarball, config/project service/projects command confirm getListedProjects filters missing folders via OpenCode server; no blacklist or destructive database/session purge added. Stored old session may still need user to select a git project after deploy. Historical session data retained; this change removes live Vault filesystem access, not old conversation history.

Rendered Helm validation code-cb785114-ea86-4212-b5a4-0d27a01d0e65 exit0:

```text
PASS rendered code pod has no Vault volume or mount; code workdir/browser use /projects/git
PASS rendered obsidian-sync still mounts /vault
```

Additional rendered checks confirm only obsidian-sync Deployment mounts Vault hostPath and ingress remains cluster-helper/nextjs-app. No runtime mounts changed yet. New arbitrary-file/upload Obsidian MCP tools are outside this PR; direct code-run writes to Vault will stop after deploy by design. Mandatory checks and PR publication follow.

### 2026-10-12T16:33:12.171331+00:00 — Mandatory full checks PASS

Implementation commit8a5b438 published with required hook code-628dd51e-f908-4bde-bf3a-9c18c230e828 exit0. All six checks passed,162files/1258tests:

```text
[test]  Test Files  162 passed (162)
[test]       Tests  1258 passed (1258)
--> Timings:
--> ┌──────────────┬──────────┬───────────┬────────┬──────────────────────┐
--> │ name         │ duration │ exit code │ killed │ command              │
--> ├──────────────┼──────────┼───────────┼────────┼──────────────────────┤
--> │ test         │ 162,268  │ 0         │ false  │ npm run test         │
--> │ lint         │ 115,451  │ 0         │ false  │ npm run lint         │
--> │ typecheck    │ 95,783   │ 0         │ false  │ npm run typecheck    │
--> │ check:helm   │ 11,335   │ 0         │ false  │ npm run check:helm   │
--> │ check:python │ 5,837    │ 0         │ false  │ npm run check:python │
--> │ check:shell  │ 1,920    │ 0         │ false  │ npm run check:shell  │
--> └──────────────┴──────────┴───────────┴────────┴──────────────────────┘
summary: (done in 164.10 seconds)
```

## Result

Separate branch implementation complete: Vault filesystem mounts removed from OpenCode/Telegram pod; repository PVC retained; workdir/browser/default roots set to /projects/git; instructions updated. Bot0.26.4 pinned with verified missing-folder menu behavior. Actual rendered manifests pass data/network boundary assertions. All mandatory checks PASS. Not merged/deployed: live absence of Vault in code pod, Telegram UI/session behavior and continued Obsidian/public endpoint function remain to be verified after user-authorized merge. Existing history retained; arbitrary Vault upload/HTML/JS API is a separate task. Publishing this evidence as a documentation-only follow-up before opening PR.

## Findings

### 2026-10-12T16:37:02.655399+00:00 — PR86 published; documentation hook PASS

PR https://github.com/senaev/infra.senaev.com/pull/86 opened at40fafe9025102873eb36de1b57166d36b763f5ec. Doc-followup push hook code-2167c2ba-eaf3-4e9f-a6a2-b0890e3c45b7 exit0:

```text
[test]  Test Files  162 passed (162)
[test]       Tests  1258 passed (1258)
--> Timings:
--> ┌──────────────┬──────────┬───────────┬────────┬──────────────────────┐
--> │ name         │ duration │ exit code │ killed │ command              │
--> ├──────────────┼──────────┼───────────┼────────┼──────────────────────┤
--> │ test         │ 157,526  │ 0         │ false  │ npm run test         │
--> │ lint         │ 116,258  │ 0         │ false  │ npm run lint         │
--> │ typecheck    │ 94,129   │ 0         │ false  │ npm run typecheck    │
--> │ check:helm   │ 8,889    │ 0         │ false  │ npm run check:helm   │
--> │ check:python │ 3,693    │ 0         │ false  │ npm run check:python │
--> │ check:shell  │ 2,096    │ 0         │ false  │ npm run check:shell  │
--> └──────────────┴──────────┴───────────┴────────┴──────────────────────┘
summary: (done in 159.67 seconds)
```

Only root instructions, bot version/default root, OpenCode Helm template/instructions and this task changed. No live Vault mutation or deployment. Removed exactly three owned temp log/body files after evidence preserved. Remote CI/review pending; post-publication entries remain uncommitted for continuation.

### 2026-10-12T16:38:17.135797+00:00 — Exact-HEAD CI PASS

GitHub Check38278583248 completed SUCCESS for40fafe9025102873eb36de1b57166d36b763f5ec. CodeRabbit submitted reviews[] and inline comments[] at latest read, still pending (no approval claim).

## Result

PR86 prepared and published; rendered Helm isolation checks and both mandatory fullhooks PASS162files/1258tests, exact-HEAD CI PASS. CodeRabbit pending. Branch not merged/deployed; runtime filesystem absence, bot UI/selected session and Obsidian/public smoke verification remain explicitly post-deploy. Only this append-only task journal uncommitted; no live Vault or existing project contents changed.

## Findings

### 2026-10-12T16:41:23.939051+00:00 — Remove root boundary documentation on user request

Removed the entire Agent data boundaries section from root AGENTS.md. Deployment isolation changes remain in scope. Previous journal entries are retained as historical evidence.

## Result

Root AGENTS.md restored to the main version; the PR no longer introduces this section. Publishing this requested documentation correction with the existing verification journal.
