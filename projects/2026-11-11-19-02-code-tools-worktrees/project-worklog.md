# Worklog

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
