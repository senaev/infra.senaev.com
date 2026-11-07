# 2026-11-07 — Shared CSV folder settings and yearly finance register

Allow Obsidian MCP to treat a directory of CSV files as one logical table, while keeping each file independently editable and safely synchronized.

## Goal

- One `csv.params.json` applies to every CSV directly within its folder, without per-file overrides or inheritance from parent folders.
- An MCP `folder` table source discovers sibling CSVs for read-only queries. Explicit `paths` with `expectedHash` remain the only way to write; preserve existing protections, resource bounds and SQL behavior.
- Support at least the 12 yearly transaction files under the existing 10 MiB input limit.
- Split the oversized financial register into per-year CSVs **manually**, preserving its 18-column schema, all row occurrences, original dates, descriptions, duplicates and import references.
- Keep an independently verified backup in an adjacent vault folder before altering the register; update active finance documentation with minimal changes while preserving historical records.

## Plan

1. Add one folder-level CSV sorting policy and validate its hash before publishing a write.
2. Add read-only folder discovery to `obsidian-csv_query`, with security and limit tests.
3. After PR review and deployment, use the existing Obsidian SQL and file/code tools to copy the original into an adjacent backup and manually populate yearly CSVs.
4. Verify original versus reconstructed datasets, counts and duplicates per year; check every file is under Obsidian Sync's size limit and has synced before retiring the original.
5. Update the active finance framework and links without rewriting historical import evidence.

## Verification

- Queries across folders and explicit paths behave consistently without bypassing symlink, size, schema, or write checks.
- 18,981 original transactions are preserved with identical field values and duplicate occurrences; comparisons are based on records, not only row counts or financial totals.
- Sorting uses the occurrence datetime first, then the value date, then the booking date, while preserving stable ties.
- Financial data and docs remain unchanged until the manual migration, and the original stays independently recoverable.

## Result

Completed on 2026-11-07. [PR #128](https://github.com/senaev/infra.senaev.com/pull/128) was merged and deployed with shared folder sorting and read-only folder queries, without migration scripts. The live 18,981 transactions were manually partitioned into `2015.csv`–`2026.csv` and independently checked against the original by grouping all 18 columns and their occurrence counts (no missing or extra rows); sorting was verified year by year. Finance references were updated, and Obsidian Sync confirmed synchronization. The original and temporary migration backups were subsequently moved to recoverable trash at the owner's request. The active dataset contains only 12 yearly CSVs and the shared configuration. Historical `_source_record` positions are no longer valid for those files.

Related project files: [status](project-status.md) · [worklog](project-worklog.md).
