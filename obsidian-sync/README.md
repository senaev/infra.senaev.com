
### Read-only CSV SQL queries

`POST /vault/csv_query` (MCP: `obsidian-csv_query`) creates a fresh in-memory
SQLite database per request. Requires Node 24.22+ (the Node 24 image and `.nvmrc`
provide the runtime). No database or cache is persisted; source CSV bytes never change.

```json
{
  "tables": [{"name": "transactions", "paths": ["data/september.csv", "data/october.csv"]}],
  "sql": "SELECT category, SUM(CAST(amount AS INTEGER)) AS total FROM transactions WHERE category = ? GROUP BY category",
  "params": ["Groceries"],
  "maxRows": 200
}
```

All imported cells are `TEXT NOT NULL`; empty cells stay empty strings. SQL owns
all conversion, including money and dates. `CAST('invalid' AS INTEGER)` yields 0
in SQLite, and integer division truncates: validate data in your query when needed.
No automatic financial rules or cents conversion exist. Joined files in one table
must have identical ordered headers. Separate tables may have different headers.
CSV uses strict UTF-8, optional BOM, comma delimiters and standard quoted fields.
Blank records are not skipped; malformed widths fail rather than being repaired.
Headers must be nonempty and unique ignoring case. Reserved headers are
`_source_path`, `_source_record`, `rowid`, `_rowid_` and `oid`.

Results use positional `rows` and ordered `columns` (duplicate result names are
preserved). `declaredType` is TEXT for source fields and may be null for expressions;
it is not a guarantee about expression value types. Integers beyond JS's safe range
are decimal strings. BLOB and non-finite results fail explicitly. Source metadata
contains paths, SHA-256 hashes, sizes and record counts. `_source_record` is a TEXT
1-based data-record index, not a physical line number. Each file is a stable byte
snapshot; a set of files is not a transaction across concurrent external edits.

The shared MCP definition documents exact limits: 8 files, 4 MiB total input,
50000 records, 100 source columns, 64 KiB decoded cell contents per CSV record, 16000 SQL characters,
100 string/null positional parameters (64 KiB serialized total), 1000 output rows and 256 KiB query output.
`truncated` and `truncationReason` identify output row/byte limits. Input is never
silently truncated. Use an explicit ORDER BY for reproducible previews. Caller SQL
LIMIT applies normally and does not mean the server truncated output.

Trusted setup alone creates tables. SQLite authorization then denies every action
except SELECT/CTEs, reads of supplied tables and an explicit built-in function list.
No extensions, file functions, user-defined functions, ATTACH or PRAGMA are exposed.
One disposable subprocess at a time isolates synchronous SQL from the event loop;
5-second deadline/cancellation kills and reaps it before admission is released.
SQLite has a 64 MiB native allocation cap and V8 a 64 MiB old-space cap, plus reduced
SQLite expression/value limits. These are not a total RSS cap. Child environment
contains no application secrets or NODE_OPTIONS; Node permissions allow reads only
of its entrypoint and CSV parser package, with no filesystem writes or child creation.
Node permissions are defense in depth, not a sandbox against native engine exploits;
the subprocess shares the service container/UID and its OS/network boundary. No SQL
function can perform network access. Keep Node/SQLite patched and use a separate
container boundary if accepting arbitrary executable code or requiring isolation
from native vulnerabilities. Raw SQL, cell contents and raw SQLite errors are not logged.

Supported SQL functions (operators, CAST, CASE, subqueries and CTEs also work):

```text
abs avg coalesce concat concat_ws count date datetime format glob hex if ifnull
 iif instr julianday length like likelihood likely lower ltrim max min nullif
 printf quote replace round rtrim sign strftime string_agg group_concat substr
 substring sum time timediff total trim typeof unicode unixepoch unlikely upper
 row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value
 last_value nth_value
```

Query errors report the failure stage or a fixed validation message, never raw SQL
or CSV contents. The five-second real deadline test intentionally belongs to the
integration suite; unit lifecycle tests use fake timers and remain under 100 ms.

SQLite internal limits also bound values/rows to 256 KiB, result columns to 128,
expression depth to 50, compound SELECTs to 20, function arguments to 32 and
LIKE/GLOB patterns to 1024 bytes. Parser buffering has an additional 65536 limit.

CSV records are validated and inserted incrementally via the parser's record
callback; parsed rows are not accumulated in a JavaScript array. Each source text
is released after import. Worker stdin counts raw chunk bytes once and releases
its input buffers after JSON decoding. Integration coverage includes the full
4 MiB input limit with 40000 rows and 100 columns under the production heap cap.
