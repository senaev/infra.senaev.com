# Worklog

## 2026-11-11 23:30 UTC — Review findings of PR #160 fixed

A seven-agent review found 2 blocking and 8 non-blocking issues. The user chose to fix all of them and to keep both `code-list` and `code-search` (removing them was the proposed simplification).

- write/patch resolve a symlink and write its target; before, the rename replaced the link.
- A one-level list uses `readdir` (like `ls -A`, without `.git`): it shows empty and ignored folders and symlinks, and works on `/`. A recursive list keeps `rg` and returns `warnings` when `rg` read only a part.
- Smaller fixes: an "is a folder" error for write, `command_failed` for a failed `mkdir`, diff headers without `a//`, `/code` in `OPEN_BROWSER_ROOTS`, test renames, new tests.
- The PVC size is not enforced by `local-path`; this is in `AGENTS.md` and in the disk-usage-telemetry project.

## 2026-11-11 21:40 UTC — A new PVC at /code, no migration

The user decided: create a new `<name>-code` PVC for every workspace (senaev and galkin) and mount it at `/code` next to `/projects`. `/projects` and its PVC stay unchanged, and nothing is copied; the user fixes the structure manually. Only `/code` is pre-defined; `projects/` and `worktrees/` are not created. This removes the migration risk.

The file tools now take absolute paths with no root confinement. The symlink, `..` and `.git` checks were removed, because `code-run` already runs as root anywhere; the container is the boundary.

## 2026-11-11 21:11 UTC — Plan moved from the vault and changed

The plan was first written in the Obsidian vault (`projects/2026-11-11-19-02-code-tools-worktrees-disk-telemetry.md`), in a Code Tools session that had no access to the sources. These decisions were made:

- Split into two projects: this one, and [disk usage telemetry](../2026-11-11-19-02-disk-usage-telemetry/README.md). They are not related and have different risks.
- Root folder `/code` with `projects/<repo>` and `worktrees/<repo>/<branch>`, on the existing PVC. A folder outside the PVC would be lost on a pod restart and other pods could not see it.
- File tools take absolute paths; only `run` takes `cwd`. One path value is simpler to check than a `cwd` plus a relative path.
- `list` always uses `rg`, so `list` and `search` see the same files, also outside a repository.
- The user refreshes the ChatGPT connector after the deploy.
- The old plan step "restore source access" was removed: it was a problem of the remote session only.
