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
snapshot hash. Edits return the saved version's new hash; edits matching no rows return the
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

An existing zero-byte or BOM-only file is uninitialized: use CREATE TABLE with
its actual SHA-256. A BOM is preserved when the headers are saved. Column names come from SQL. Optional TEXT declarations are
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
Column changes use the same command and hash precondition:

```sql
ALTER TABLE items ADD COLUMN comment TEXT;
ALTER TABLE items DROP COLUMN comment;
```

Each example is a separate request. ADD accepts a column name with optional TEXT;
existing records receive empty strings. DROP removes that column's header and
values, preserving other columns and row order. The final column cannot be dropped.
Schema changes publish their new headers even for empty tables, return affectedRows:0,
and use the same column/record/byte limits, diffs, hashes and atomic publication.
Only ADD/DROP column forms are allowed; renaming tables/columns and other DDL remain
unsupported. Defaults and constraints are rejected because they cannot persist in CSV.
The worker uses SQLite's authorizer to identify the mapped ALTER target, then runs
only a narrowly validated reconstruction with quoted identifiers; ADD uses TEXT
with an empty-string default internally. Arbitrary supplied SQL never runs with
authorization disabled.

The supplied hash is also checked on reads when present. No SQL keyword regex
selects the execution mode. RETURNING, DROP TABLE, renaming, triggers, other DDL and
multiple statements are unsupported. NULL/BLOB writes are rejected; omitted cells
use empty-string defaults. CSV edits use standard quoting, preserve column order,
BOM and record delimiter, and may normalize quote spelling. Field values are not
trimmed, interpreted, converted to money or sanitized as spreadsheet formulas.

Edits return affectedRows, changed, diff and the saved hash. No rows are persisted
until SQL and export validation succeed. A shared in-process file reservation and
fresh byte-hash check precede atomic publication. Creation is exclusive. These checks do not transactionally lock external
writers/replicas; cross-process atomic compare-and-swap is not claimed. Each input
file is a snapshot, not a simultaneous transaction across all selected files.

## Persistent sorting

An optional sidecar beside each writable CSV controls its saved row order:
`transactions.csv.params.json` for `transactions.csv`.

```json
{
  "sort": [
    {"expression": "occurred_datetime", "direction": "DESC"}
  ]
}
```

Keys apply in array order. `expression` is a SQLite expression, for example
`CAST(amount AS REAL)` or `COALESCE(NULLIF(occurred_datetime, ''), value_datetime)`.
`direction` is ASC or DESC (case-insensitive). Equal keys retain their previous
relative order via a final `rowid ASC`. Empty strings use ordinary SQLite text
ordering; there is no type or empty-value setting. Only original CSV columns are
exported. With no sidecar or `{"sort":[]}`, existing row order is preserved.

Sorting runs when INSERT/UPDATE/DELETE matches rows or a schema change is saved.
Adding/editing the sidecar alone does not rewrite the CSV; neither does SELECT or
an edit matching no rows. To explicitly apply settings, a hash-guarded
`UPDATE t SET column_name=column_name` can be used. Expressions must remain valid
after column changes, otherwise no CSV is saved.

Sidecars are strict UTF-8 JSON objects containing only `sort`, bounded to 16 KiB,
16 keys and 1000 characters per expression. Each entry contains only `expression`
and `direction`. Invalid settings reject the edit. Expressions cannot contain SQL
comments, bindings, statement separators or unbalanced parentheses, and are
prepared under a read-only authorizer allowing only the edited table and the
existing approved functions. Other tables, schema metadata and file/network
functions are denied. Existing subprocess/resource limits cover sorting too.
Sidecar paths use the normal vault path/symlink checks; their byte hashes
(including absence) are rechecked before publication. As with CSV hash checks,
this detects intervening changes but does not provide cross-process atomic
compare-and-swap or a transaction across the CSV and sidecar.

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
Records are inserted incrementally, and IPC input and output bytes are counted linearly.
Only supplied tables and allowlisted built-in analytical functions are accessible.
Filesystem/network functions, PRAGMA, ATTACH, extensions and user code are denied.
Child environment contains no application secrets; auto-instrumentation is disabled
only for the restricted child. Node permissions allow its entrypoint and CSV package
reads but no filesystem writes or subprocesses. Permissions are defense in depth,
not protection against native engine exploits; the worker shares the service UID
and container. Keep Node/SQLite patched. Node 24.22+ is required.

Tests cover full 4 MiB inputs, real deadline/cancellation, SQL classification,
creation/zero-byte initialization, ADD/DROP columns, CRUD/no-op/error hashes, atomic publication and
path/version conflicts. Fast unit lifecycle tests use mocks and fake timers. CRUD file tests invoke the
same real SQLite engine directly, mocking only the subprocess boundary. Real HTTP,
column-change subprocess execution, full header-size stress checks, process isolation/deadline/cancellation and full-size checks remain integration
coverage; their measured runtimes are reported separately from the 100 ms unit
budget. The byte-limit edit fixture uses few fields; the separate wide read stress
fixture covers 40000 records and 100 columns.
