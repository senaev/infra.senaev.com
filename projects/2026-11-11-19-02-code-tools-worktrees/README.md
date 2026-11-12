# 2026-11-11 — Code Tools: any folder, and git worktrees

Code Tools works in any folder by absolute paths. Repositories and worktrees have one documented layout under `/code`.

## Goal

- Today the Code Tools tools take a `project` name. A project is a folder directly under `/projects` that holds `.git`, and the file tools stay inside it. Remove this model.
- The file tools take absolute paths. `code-run` takes an absolute `cwd`. They work in any folder, also outside a repository.
- Parallel tasks use git worktrees, one for each branch, so tasks do not share one working tree.
- Do not change the restrictions of the Obsidian tools.

## Context

- Contract: `senaev-utils/src/codeTools/codeCommands.ts`, `codeToolDefinitions.ts` (schemas, descriptions, `SERVER_RULES`).
- Resolver: `code-tools/src/tools/projectAccess.ts`, `senaev-utils/src/files/rootRelativePath.ts`.
- Commands: `code-tools/src/tools/*Command.ts`, the `projects` tool: `projectsCommand.ts`.
- `list` uses `git ls-files` (`code-tools/src/git/runGit.ts`); `search` uses `rg`.
- The queue is global (`OperationManager`), not keyed by project. The file lock is keyed by the absolute path. Timeouts, cancellation and hash checks do not depend on projects.
- cluster-helper passes the arguments unchanged (`cluster-helper/src/codeToolsApi.ts`). It compiles in the tool definitions, so it deploys together with code-tools.
- The pods mount the `<name>-projects` PVC (16Gi) at `/projects`: Code Tools (`_code-tools.tpl`), OpenCode (`OPENCODE_WORKDIR`), the Telegram bot (`OPEN_BROWSER_ROOTS`) and OMP (`_omp-web.tpl`). The repositories are at the top level of the PVC.
- Agent instructions: `provisioning/helm/senaev-com/config/senaev-llm-instructions-path/AGENTS.md` (the "Projects" section), mounted at `/AGENTS.md`.
- The container runs as root, and `code-run` can already go to any folder. The container is the security boundary, not the path checks of the file tools.

## Folder layout

```
/code/                          # the new <name>-code PVC; only /code itself is created
├── projects/<repo>/            # main checkout: always on the default branch, no edits
└── worktrees/<repo>/<branch>/  # one worktree for each task; branch = slug, no "/"
```

Workflow for a task:

```
git -C /code/projects/<repo> fetch origin
git -C /code/projects/<repo> worktree add /code/worktrees/<repo>/<branch> -b <branch> origin/main
# ...work, checks, PR...
git -C /code/projects/<repo> worktree remove /code/worktrees/<repo>/<branch>
git -C /code/projects/<repo> worktree prune
```

In this repository, each worktree needs `npm run ci:all`, so it uses much disk space. Remove a worktree when its PR is merged.

## Plan

1. 📌 Contract: remove `project` and the `code-projects` tool.
   - `read`, `write`, `patch`: absolute `path` / `paths`.
   - `list`, `search`: absolute `folder` (required).
   - `run`: absolute `cwd` (required).
   - Results return absolute paths.
2. 📌 Path checks: the path is absolute, normalized, has no NUL, and exists (or its parent, for `write`). Remove the root, `..`, symlink and `.git` checks, because there is no root now. Keep the hash checks, the queue, timeouts and cancellation.
3. 📌 `list` always uses `rg --files --hidden --glob '!.git'`, the same file set as `search`. A tracked file that matches `.gitignore` is not shown; this is accepted.
4. 📌 Descriptions, `SERVER_RULES` and `/AGENTS.md`: describe the folder layout and the worktree workflow above, nothing about project registration.
5. 📌 Tests: update the fixtures and assertions; add tests for a folder outside a repository, absolute and relative path errors, and hash conflicts.
6. 📌 A new `<name>-code` PVC (`codeStorageSize`) for every workspace, mounted at `/code` next to `/projects` in Code Tools, OpenCode, the Telegram bot and OMP. `/projects` and its PVC stay as they are; nothing is copied or migrated. The user fixes the structure manually. `CODE_TOOLS_PROJECTS_PATH` is removed.
7. 📌 PR, several review cycles (efficiency, security, correctness), fixes.
8. 📌 After deploy: the user refreshes the ChatGPT connector. Create `/code/projects/infra.senaev.com` on `main` and the first worktree, `/code/worktrees/infra.senaev.com/disk-usage-telemetry`, for [the next project](../2026-11-11-19-02-disk-usage-telemetry/README.md).

## Verification

- Through ChatGPT: `code-run` with `cwd: /tmp` works; `code-list` and `code-search` in a folder outside a repository work; `code-read` → `code-patch` with the hash works, and a stale hash gives `conflict`.
- A long `code-run` stops on its timeout and on cancellation.
- `/code` and `/projects` are both mounted in Code Tools, OpenCode, the Telegram bot and OMP (senaev and galkin).
