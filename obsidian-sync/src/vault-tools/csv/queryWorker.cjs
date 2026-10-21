/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS child runs without a transpiler */
// Plain CommonJS: runs directly under Node, without tsx hooks or application modules.
const { DatabaseSync, constants } = require('node:sqlite');

const { parse } = require('csv-parse/sync');

const allowedFunctions = new Set('abs avg coalesce concat concat_ws count date datetime format glob hex if ifnull iif instr julianday length like likelihood likely lower ltrim max min nullif printf quote replace round rtrim sign strftime string_agg substr substring sum time timediff total trim typeof unicode unixepoch unlikely upper'.split(' '));
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const fail = (message) => {
    throw new Error(message);
};

function query(input) {
    const db = new DatabaseSync(':memory:', {
        allowExtension: false,
        enableDoubleQuotedStringLiterals: false,
    });

    try {
        if (!db.limits || typeof db.setAuthorizer !== 'function') {
            fail('Node 24.22 or newer is required');
        }

        // SQLite allocations are separate from V8's heap; this cap is process-local.
        db.exec('PRAGMA hard_heap_limit=67108864; PRAGMA temp_store=MEMORY; PRAGMA trusted_schema=OFF');
        Object.assign(db.limits, {
            length: 262144,
            sqlLength: 65536,
            column: 128,
            exprDepth: 50,
            compoundSelect: 20,
            vdbeOp: 100000,
            functionArg: 32,
            attach: 0,
            likePatternLength: 1024,
            variableNumber: 128,
        });
        if (db.limits.length !== 262144) {
            fail('SQLite resource limits are unavailable');
        }

        const sources = [];
        let totalRecords = 0;

        for (const table of input.tables) {
            let headers;
            let insert;

            for (const source of table.sources) {
                const records = parse(source.text, {
                    bom: true,
                    skip_empty_lines: false,
                    max_record_size: 65536,
                });
                const current = records.shift();

                if (!current || current.length === 0 || current.length > 100) {
                    fail('CSV requires 1..100 header columns');
                }

                const names = current.map((name) => name.toLowerCase());

                if (current.some((name) => !name.trim() || name.includes('\0')) || new Set(names).size !== names.length || names.some((name) => [
                    '_source_path',
                    '_source_record',
                    'rowid',
                    '_rowid_',
                    'oid',
                ].includes(name))) {
                    fail('CSV has empty, duplicate or reserved headers');
                }

                if (!headers) {
                    headers = current;
                    db.exec(`CREATE TABLE ${quote(table.name)} (${[
                        ...headers,
                        '_source_path',
                        '_source_record',
                    ].map((name) => `${quote(name)} TEXT NOT NULL`).join(',')}) STRICT`);
                    insert = db.prepare(`INSERT INTO ${quote(table.name)} VALUES (${Array(headers.length + 2).fill('?').join(',')})`);
                } else if (JSON.stringify(headers) !== JSON.stringify(current)) {
                    fail('CSV headers differ within a table');
                }

                if (totalRecords + records.length > 50000) {
                    fail('CSV exceeds 50000 data records');
                }

                db.exec('BEGIN');
                for (let index = 0; index < records.length; index++) {
                    insert.run(...records[index], source.path, String(index + 1));
                }

                db.exec('COMMIT');
                totalRecords += records.length;
                sources.push({
                    table: table.name,
                    path: source.path,
                    hash: source.hash,
                    size: source.size,
                    records: records.length,
                });
            }
        }

        db.exec('PRAGMA query_only=ON');
        const tables = new Set(input.tables.map((table) => table.name.toLowerCase()));

        db.setAuthorizer((action, first, second, database) => {
            if (action === constants.SQLITE_SELECT || action === constants.SQLITE_RECURSIVE) {
                return constants.SQLITE_OK;
            }

            // SQLite reports a null database for CTEs and COUNT(*) table reads.
            if (action === constants.SQLITE_READ && ((database === 'main' && tables.has(first.toLowerCase())) || (database === null && !first.toLowerCase().startsWith('sqlite_')))) {
                return constants.SQLITE_OK;
            }

            if (action === constants.SQLITE_FUNCTION && allowedFunctions.has(second)) {
                return constants.SQLITE_OK;
            }

            return constants.SQLITE_DENY;
        });
        const statement = db.prepare(input.sql);

        // prepare compiles only the first statement. Reject any unconsumed SQL.
        if (statement.sourceSQL.trim() !== input.sql.trim()) {
            fail('Exactly one SQL statement is required; trailing SQL/comments are not accepted');
        }

        statement.setReadBigInts(true);
        statement.setReturnArrays(true);
        const columns = statement.columns().map(({ name, type }) => {
            return {
                name,
                declaredType: type,
            };
        });

        if (!columns.length) {
            fail('SQL must return columns');
        }

        const result = {
            columns,
            rows: [],
            sources,
            truncated: false,
            truncationReason: null,
        };
        let rowBytes = 0;
        const baseBytes = Buffer.byteLength(JSON.stringify(result));

        for (const raw of statement.iterate(...input.params)) {
            if (result.rows.length >= input.maxRows) {
                result.truncated = true;
                result.truncationReason = 'row_limit';
                break;
            }

            const row = raw.map((value) => {
                if (typeof value === 'bigint') {
                    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : String(value);
                }

                if (ArrayBuffer.isView(value)) {
                    fail('BLOB results are unsupported; use hex() or CAST AS TEXT');
                }

                if (typeof value === 'number' && !Number.isFinite(value)) {
                    fail('Non-finite results are unsupported');
                }

                return value;
            });
            const bytes = Buffer.byteLength(JSON.stringify(row)) + 1;

            if (baseBytes + rowBytes + bytes > 260000) {
                result.truncated = true;
                result.truncationReason = 'byte_limit';
                break;
            }

            rowBytes += bytes;
            result.rows.push(row);
        }

        if (Buffer.byteLength(JSON.stringify(result)) > 262144) {
            fail('Result metadata exceeds output limit');
        }

        return result;
    } finally {
        db.close();
    }
}

// Parent sends bounded immutable snapshots; the worker never opens vault paths.
let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    input += chunk;
    if (Buffer.byteLength(input) > 26000000) {
        process.exit(1);
    }
});
process.stdin.on('end', () => {
    try {
        process.stdout.write(JSON.stringify({ result: query(JSON.parse(input)) }));
    } catch {
        // SQL/CSV errors can contain private values. Keep errors bounded and data-free.
        process.stdout.write(JSON.stringify({ error: 'CSV query rejected: check CSV headers/records, SQL syntax, permitted functions, parameters and resource limits' }));
    }
});
