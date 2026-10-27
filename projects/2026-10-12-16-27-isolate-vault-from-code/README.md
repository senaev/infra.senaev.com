# 2026-10-12 — Isolate Obsidian Vault from code containers

- [x] Remove the Obsidian vault mount from code containers

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

## Findings

### 2026-10-12T16:46:43.780320+00:00 — Pre-merge review correction

User authorized merge, deployment verification and final main journal commit. Root boundary section removal published in76e3735; all six checks PASS162files/1258tests, exact-HEAD CI38279470963 SUCCESS. CodeRabbit identified bot0.26.4 requires Node ^22.14.0 || ^23.6.0 || >=24 and rejects Node20 at CLI startup. Verified the published npm tarball package.json and dist/runtime/node-version.js. Changed bot base image to node:22-alpine before merging; image build/deploy will verify installation and startup. No merge yet.

### 2026-10-12T16:51:59.685692+00:00 — PR86 merged after checks

Node correction96195557e46c64177518c6e5f187eb3ba6b21843 passed all six pre-push checks162files/1258tests (code-e41bd31b-50e8-444a-b23d-aa50676c4d88 exit0) and CI38280063732 SUCCESS. CodeRabbit status SUCCESS; original major Node finding independently verified and fixed, inline comments empty. PR86 merged with expected-head guard at2026-10-12T16:51:31Z: c58ea51c76484467ea35367e304a0cd8e290ee3d. Main fast-forwarded cleanly. Triggered exact-merge runs: Check38280307734, Update Helm Charts38280307717, bot build/deploy38280307754. Awaiting all results and live verification.

### 2026-10-12T16:55:55.381140+00:00 — Deployment and live verification PASS

All exact-merge workflows completed successfully: Check38280307734, Update Helm Charts38280307717 (all8 matrix jobs success; only senaev-com changed), opencode-telegram-bot38280307754. Actual bot image built from node:22-alpine digest0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 and installed0.26.4. Rollout log:

```text
2026-10-12T16:53:54.6188447Z out: deployment "opencode-telegram" successfully rolled out
```

Public Code MCP briefly returned INVALID_ARGUMENT during pod replacement; recovered without alternate authorization or tokens. New hostname opencode-telegram-76ff8788cd-nvxdr. Live code-d349e813-d693-4c31-9c18-de69fd892915 exit0:

```text
PASS former Vault path absent and read fails ENOENT
PASS no Vault mount in current Code Tools container
PASS git repository remains available
OPENCODE_WORKDIR=/projects/git
```

code-projects code-0644812b-fac8-454c-a49a-e39bd95f46a2 completed and lists infra.senaev.com on main. Obsidian read obsidian-048f8cb9-2292-4ffb-af6c-fa9d798e4ecc completed with unchanged AGENTS.md hash5458a865df4c54af6b3bb5ecba547b1c8b1886858656ff41f048acb99d8a08ab; search obsidian-1bd75a2c-e01c-4908-97dd-cda88bfd5c04 completed with expected Public static files match. No Vault writes or fixtures created.

Public HTTP smoke outputs:

```text
https://s.senaev.com/1bxsl9 -> https://senaev.com/cv/5min: 200 text/html; charset=utf-8,60436bytes
https://static.senaev.com/datadog-dc-by-org-id.html: 200 text/html; charset=utf-8,4991bytes
https://senaev.com/notes/my_blog_post_senaev_speaks_12: 200 text/html; charset=utf-8,23565bytes
https://static.senaev.com/hello-world/: 200 text/html; charset=utf-8,2386bytes
https://static.senaev.com/hello-world/counter.js: 200 application/javascript; charset=utf-8,269bytes
```

Limits: direct mount/read checks cover the actual Code Tools/OpenCode container. Bot mount removal is evidenced by rendered pod specification and successful rollout; no independent bot-container filesystem shell, Telegram interactive UI/session switching, browser visual/click test, desktop Obsidian Sync round-trip or new Vault-write regression performed. Do not treat these as live-verified. Historical sessions remain; a previously selected Vault session may require user selection of a git project. No new exclusions/blacklists or upload capability added.

## Result

PR86 merged and deployed successfully. Vault mount removed from code pod; git storage and /projects/git workdir remain available. Obsidian MCP read/search and all required public smoke routes PASS. Root Agent data boundaries section removed per user request; root AGENTS.md has no PR diff. CodeRabbit's Node20 incompatibility corrected before merge. All mandatory pre-push checks162files/1258tests, PR CI and all merge workflows PASS. Evidence and explicit live limitations retained above. User authorized this final journal-only commit directly on main.
