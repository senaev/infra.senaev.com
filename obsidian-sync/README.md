# Vault CSV SQL command

`POST /vault/csv_query` / MCP `obsidian-csv_query` runs one SQL statement. SQLite's
authorization callbacks classify the operation during preparation; no edit flag,
separate command, type inference or separate column-list argument is used.

CSV files are authoritative. Every call builds temporary in-memory SQLite tables;
no database or index is persisted. Every imported cell is TEXT, including empty
strings and leading zeros. SQL explicitly controls casts; SQLite's numeric casts
are permissive, and integer division truncates.

## Reads and hashes

```json
{
  "tables": [{"name": "transactions", "paths": ["data/september.csv", "data/october.csv"]}],
  "sql": "SELECT category, SUM(CAST(amount AS INTEGER)) FROM transactions GROUP BY category"
}
```

Read tables may combine files with identical ordered headers. Different tables
may have different headers; map each path once and use SQL aliases for self-joins.
Read-only tables expose TEXT `_source_path` and `_source_record` columns; record
numbers are 1-based data-record indexes, not physical lines. A mutated table
exposes its actual CSV columns only, so ordinary INSERT INTO t VALUES (...) works.

Every completed result includes `hashes: [{path, hash}]` and source hashes/record
counts. A single-file result also includes `hash`. SELECT returns the loaded
snapshot hash. Edits return the saved version's new hash; no-op edits return the
unchanged hash and preserve the original bytes. Expected failures include current
hashes in details.hashes/details.hash when accessible; a missing/unavailable hash is null, and failures before
identifying safe file paths have an empty hashes list. Managed queue/running
handles are not completed operations: retrieve their final result for hashes.

Results use ordered columns and positional rows, preserving duplicate result
names. Expression declared types may be null. Large integers are decimal strings;
BLOB/non-finite results are rejected. Explicit truncation identifies output row or
byte limits; caller SQL LIMIT is distinct from server truncation.

## Creating and editing

Create a missing file directly, avoiding ChatGPT's zero-byte upload restriction:

```json
{
  "tables": [{"name": "items", "paths": ["data/items.csv"], "expectedHash": null}],
  "sql": "CREATE TABLE items(id TEXT, value TEXT)"
}
```

An existing zero-byte file is uninitialized: use CREATE TABLE with its actual
empty-file SHA-256. Column names come from SQL. Optional TEXT declarations are
accepted; constraints, defaults, generated columns and other types are rejected
because CSV cannot persist them. A header-only CSV already represents an empty
table. DELETE FROM items preserves the header instead of producing a zero-byte file.

Use the returned hash as the next write's version precondition:

```json
{
  "tables": [{"name": "items", "paths": ["data/items.csv"], "expectedHash": "<latest SHA-256>"}],
  "sql": "INSERT INTO items VALUES (?, ?)",
  "params": ["00123", "first"]
}
```

The same command accepts UPDATE and DELETE, including WITH statements/subqueries.
One statement may mutate exactly one physical CSV; its table must map to one path
and include expectedHash. Other tables may supply read-only join/subquery data.
The supplied hash is also checked on reads when present. No SQL keyword regex
selects the execution mode. RETURNING, ALTER, DROP, triggers, arbitrary DDL and
multiple statements are unsupported. NULL/BLOB writes are rejected; omitted cells
use empty-string defaults. CSV edits use standard quoting, preserve column order,
BOM and record delimiter, and may normalize quote spelling. Field values are not
trimmed, interpreted, converted to money or sanitized as spreadsheet formulas.

Edits return affectedRows, changed, diff and the saved hash. No rows are persisted
until SQL and export validation succeed. A shared in-process file reservation and
fresh byte-hash check precede atomic publication. A validated directory descriptor
anchors publication, preventing a substituted ancestor symlink from redirecting
writes. Creation is exclusive. These checks do not transactionally lock external
writers/replicas; cross-process atomic compare-and-swap is not claimed. Each input
file is a snapshot, not a simultaneous transaction across all selected files.

## Limits and isolation

Strict UTF-8 CSV, comma separators, optional BOM, standard quoted fields. Blank
records are not skipped; malformed widths and empty/duplicate/reserved headers
fail. Reserved headers: _source_path, _source_record, rowid, _rowid_, oid.

Limits: 8 files, 4 MiB total input and edited file size, 50000 records, 100 source
columns, 64 KiB decoded cell contents per record, 16000 SQL characters, 100
string/null parameters (64 KiB serialized total), 1000 output rows, 256 KiB query
result budget including reserved hash metadata. maxRows defaults to 200. SQL edits
are never silently truncated. Use ORDER BY for reproducible read previews.

A disposable subprocess keeps synchronous SQLite off the server event loop. One
CSV operation at a time; five-second worker deadline, termination/reaping on abort,
64 MiB SQLite allocation cap and 64 MiB V8 old-space cap (not a total RSS cap).
Records are inserted incrementally, and IPC input bytes are counted linearly.
Only supplied tables and allowlisted built-in analytical functions are accessible.
Filesystem/network functions, PRAGMA, ATTACH, extensions and user code are denied.
Child environment contains no application secrets; auto-instrumentation is disabled
only for the restricted child. Node permissions allow its entrypoint and CSV package
reads but no filesystem writes or subprocesses. Permissions are defense in depth,
not protection against native engine exploits; the worker shares the service UID
and container. Keep Node/SQLite patched. Node 24.22+ is required.

Tests cover full 4 MiB inputs, real deadline/cancellation, SQL classification,
creation/zero-byte initialization, CRUD/no-op/error hashes, atomic publication and
path/version conflicts. Fast unit lifecycle tests use mocks and fake timers.
