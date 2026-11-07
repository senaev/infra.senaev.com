# 2026-11-07 — Yearly finance CSVs with shared folder settings

Split the financial transaction register into yearly CSV files that Obsidian Sync can synchronize, preserving all transaction information and making sorting consistent without duplicated configuration files.

## Goal

- Replace the oversized single `transactions.csv` with `YYYY.csv` files using the same 18 columns and original source-field values.
- Use one `csv.params.json` per folder to sort every CSV directly inside it; no per-file overrides or inherited settings.
- Retain the chronological ordering based on `occurred_datetime`, otherwise `value_datetime`, otherwise `transaction_datetime`, while preserving stable order for equal keys.
- Keep a compressed, byte-for-byte recoverable original in an adjacent backup folder outside the active dataset, verify all 18,981 transaction occurrences, and do not lose duplicates or historical context.
- Keep the existing `obsidian-csv_query` interface and support reading up to 16 files together, within its existing 10 MiB input budget; writes remain single-file operations.
- Update the active finance framework and only directly affected links, preserving historical import logs as records of what actually happened.

## Plan

1. Add folder-level config loading with safe hash rechecks and coverage for missing, changed, invalid and shared configs.
2. Increase the CSV file-count limit, preserving resource bounds and existing write constraints.
3. Stage a compressed, checksum-verified original in the adjacent `transactions-backup/` directory and keep the original live CSV until remote sync is verified.
4. Partition rows by the first available of occurrence/value/booking datetime into 2015–2026 CSVs, preserving all 18 column values, repeated transactions and source identifiers.
5. Validate exact row multisets, schema, year partition, counts, sorting and size under the 5 MB Sync Standard limit. Run explicit finalization only after the archive and all yearly files are confirmed synced.
6. Update finance documentation and any references that rely on a single path or unstable `_source_record` position. Confirm Obsidian Sync downloads and the new MCP query behavior after deployment.

## Verification

- Before/after source hashes, per-year row counts, 18-column header equality, and exact occurrence-sensitive whole-row comparisons; totals by account and currency as secondary cross-checks.
- One shared folder policy applies consistently to all CSVs, while other folders are unaffected.
- Every synced CSV is below 5 MB, and historical source identifiers remain unmodified.
- No duplicate transaction data in the active dataset; no loss of the recoverable original.
