- [ ] Implement folder-level CSV settings and read-only MCP dataset selection; later migrate the financial data manually.

## Stage

MCP refactor implemented in PR #128; local checks passed. Live vault transaction files remain unchanged.

## Completed

- Shared `csv.params.json` for direct CSV children; no per-file overrides or parent inheritance.
- Support for up to 16 CSV paths and read-only folder mapping.
- Migration scripts removed at the owner's request; manual SQL copy tested.

## Next steps

Review and deploy PR. Migrate the vault separately using existing tools, verifying backup and row identity before removing the original.
