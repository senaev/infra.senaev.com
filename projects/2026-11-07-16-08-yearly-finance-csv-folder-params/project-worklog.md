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
