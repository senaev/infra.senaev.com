- [ ] Complete yearly financial CSV migration and shared folder sorting configuration without losing data.

## Stage

Code implemented and locally verified in isolated worktree. Live vault remains unchanged; pull request review and deployment needed before migration.

## Completed

- Folder-wide `csv.params.json` replaces per-file sidecars without inheritance.
- Read-only queries accept up to 16 CSV paths; the 10 MiB input and single-file write limits remain.
- Two-phase dry-run/stage/finalize migration with exact gzip backup and occurrence-sensitive row verification.
- Targeted lint, TypeScript and 110 tests pass, including subprocess integration cases.

## Next steps

Review and merge PR, deploy, run dry-run/stage, independently verify Obsidian Sync, update live finance framework/references, then finalize.
