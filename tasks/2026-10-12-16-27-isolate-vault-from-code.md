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
