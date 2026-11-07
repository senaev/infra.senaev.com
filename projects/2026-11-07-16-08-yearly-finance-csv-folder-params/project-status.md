- [x] Implement folder-level CSV settings and folder-based MCP queries; migrate the entire financial register to yearly files without data loss.

## Stage

Completed and verified in production on 2026-11-07.

## Completed

- PR #128 merged and deployed; shared folder-wide `csv.params.json` and read-only folder queries are available.
- Manually migrated 18,981 transactions into 12 yearly CSVs (2015–2026) without migration scripts.
- Verified complete 18-column row multisets, including duplicate occurrences; no missing or extra rows. Verified each year's descending sort order.
- Updated active finance documentation, verified Obsidian Sync, and retired the oversized original to recoverable trash.
- Temporary migration backup CSVs were verified, then moved to recoverable trash at the owner's request. The active backup folder is empty; all 12 yearly files remain.

## Result

All requested migration and MCP changes are complete. The previous single-file `_source_record` row positions are historical and cannot be used as positions in the new yearly files.
