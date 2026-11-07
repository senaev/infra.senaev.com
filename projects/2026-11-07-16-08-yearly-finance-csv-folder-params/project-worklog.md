## 2026-11-07 18:39 UTC — Project completed and migration backups retired

PR #128 was merged and deployed. The original register was manually partitioned into 12 annual files using MCP SQL; all 18,981 transactions were verified by comparing every 18-column row and duplicate multiplicity. The active finance documentation was updated and the oversized original moved to recoverable trash. On user request, both verified temporary backup files were subsequently moved to recoverable trash, leaving the active yearly files untouched.

```text
2015–2021: backup 8,446 rows; migrated 8,446; missing 0; extra 0
2022–2026: backup 10,535 rows; migrated 10,535; missing 0; extra 0
Total: 18,981 rows; missing 0; extra 0
Active transactions: 2015.csv–2026.csv plus csv.params.json
Active transactions-backup/: 0 files
```

## 2026-11-07 16:42 UTC — MCP-only refactor verified

Removed dedicated transaction migration scripts. Added read-only `folder` mapping for all direct CSV children with the same schema; writes continue to require a single `paths` entry and `expectedHash`. SQL INSERT ... SELECT from another CSV into a hash-guarded destination was tested as the basis for later manual migration.

```
TypeScript: pass
ESLint: pass
Test Files: 5 passed (5)
Tests: 189 passed (189)
```

No live vault data was changed.

## 2026-11-07 16:34 UTC — Script-free migration decision

Owner requested removing all migration scripts from PR #128. MCP alone will support folder-wide `csv.params.json`, reading direct CSV children by `folder`, and up to 16 files. Live vault migration and backup/documentation updates will be performed manually with existing tools only after review and deployment. The existing vault repo checkout has uncommitted changes and is left untouched.

## 2026-11-07 16:27 UTC — Implementation and local verification

Folder-level sorting and 16-file reads implemented. Yearly migration utility runs a read-only dry-run by default, stages verified `YYYY.csv` files and a byte-perfect compressed archive in an adjacent backup directory, then requires a separate finalization after independent sync confirmation. No live vault data was modified.

```
Test Files  4 passed (4)
Tests       110 passed (110)
```

## 2026-11-07 16:08 UTC — Design selected

- Isolated worktree at `/projects/git/worktrees/infra-csv-folder-params`, based on `origin/main`.
- Agreed one `csv.params.json` per directory, applied only to direct CSV children; no per-file JSON and no parent-directory inheritance.
- Original vault CSV: 7,868,017 bytes, SHA-256 `b8b078ee2b0a45dfd8ad6b7ac21a8dcc98ddad6e51d17744683255b445dae5af`, 18,981 records, 18 columns; dates distribute across 2015–2026 using occurrence and then value date.
- Data migration must preserve original rows and provide independent backup before removal; worktree has no direct vault mount, so protected vault operations are needed.
