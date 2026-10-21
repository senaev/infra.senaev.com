/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS child runs without a transpiler */
// Plain CommonJS: runs directly under Node, without tsx hooks or application modules.
const { DatabaseSync, constants } = require('node:sqlite');

const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const allowedFunctions = new Set('group_concat row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value abs avg coalesce concat concat_ws count date datetime format glob hex if ifnull iif instr julianday length like likelihood likely lower ltrim max min nullif printf quote replace round rtrim sign strftime string_agg substr substring sum time timediff total trim typeof unicode unixepoch unlikely upper'.split(' '));
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
let stage = 'initialization';

class PublicQueryError extends Error {}
const fail = (message) => {
    throw new PublicQueryError(message);
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

        db.enableDefensive(true);
        const sources = [];
        const formats = new Map();
        let totalRecords = 0;

        for (const table of input.tables) {
            let headers;

            formats.set(table.name, {
                bom: table.sources[0].text.startsWith('\uFEFF'),
                recordDelimiter: recordDelimiter(table.sources[0].text),
            });
            let insert;
            let insertEmpty;

            for (const source of table.sources) {
                let firstRecord = true;
                let sourceRecords = 0;

                stage = 'CSV parsing/validation/import';
                db.exec('BEGIN');
                parse(source.text, {
                    bom: true,
                    skip_empty_lines: false,
                    max_record_size: 65536,
                    // Returning null prevents csv-parse/sync from retaining records.
                    on_record(record) {
                        const decodedBytes = record.reduce((bytes, cell) => bytes + (cell.length ? Buffer.byteLength(cell) : 0), 0);

                        if (decodedBytes > 65536) {
                            fail('CSV decoded record contents exceed 64 KiB');
                        }

                        if (firstRecord) {
                            firstRecord = false;
                            if (record.length === 0 || record.length > 100) {
                                fail('CSV requires 1..100 header columns');
                            }

                            const names = record.map((name) => name.toLowerCase());

                            if (record.some((name) => !name.trim() || name.includes('\0')) || new Set(names).size !== names.length || names.some((name) => [
                                '_source_path',
                                '_source_record',
                                'rowid',
                                '_rowid_',
                                'oid',
                            ].includes(name))) {
                                fail('CSV has empty, duplicate or reserved headers');
                            }

                            if (!headers) {
                                headers = record;
                                db.exec(`CREATE TABLE ${quote(table.name)} (${[...headers].map((name) => `${quote(name)} TEXT NOT NULL DEFAULT ''`).join(',')}) STRICT`);
                                insert = db.prepare(`INSERT INTO ${quote(table.name)} VALUES (${Array(headers.length).fill('?').join(',')})`);
                                insertEmpty = db.prepare(`INSERT INTO ${quote(table.name)} DEFAULT VALUES`);
                            } else if (JSON.stringify(headers) !== JSON.stringify(record)) {
                                fail('CSV headers differ within a table');
                            }
                        } else {
                            if (++totalRecords > 50000) {
                                fail('CSV exceeds 50000 data records');
                            }

                            // Every imported column defaults to empty TEXT. Avoid binding up to
                            // 100 identical empty strings for an entirely empty record.
                            if (decodedBytes === 0) {
                                insertEmpty.run();
                            } else {
                                insert.run(...record);
                            }
                            sourceRecords++;
                        }

                        return null;
                    },
                });
                if (firstRecord && table.sources.length !== 1) {
                    fail('Empty CSV without headers cannot be combined with other files');
                }

                db.exec('COMMIT');
                table.headers = headers;
                source.text = '';
                sources.push({
                    table: table.name,
                    path: source.path,
                    hash: source.hash,
                    size: source.size,
                    records: sourceRecords,
                });
            }
        }

        const classification = classifyAndPrepare(db, input, sources);
        const {
            statement, mutation, creating,
        } = classification;

        if (mutation) {
            if (statement.columns().length) {
                fail('SQL edits with RETURNING are unsupported');
            }

            stage = 'SQL edit execution';
            const { changes } = statement.run(...input.params);

            db.setAuthorizer(null);
            if (creating) {
                // This grammar check rejects unsupported CSV schema features, not SQL classification.
                const words = input.sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]/g, ' ');

                if (/\b(CHECK|UNIQUE|REFERENCES|CONSTRAINT|FOREIGN|PRIMARY|DEFAULT|GENERATED|COLLATE|AS|WITHOUT)\b/i.test(words)) {
                    fail('CREATE TABLE persists column names only; constraints and computed schemas are unsupported');
                }

                const info = db.prepare(`PRAGMA table_xinfo(${quote(mutation.name)})`).all();

                if (info.some((column) => column.hidden || (column.type !== '' && column.type.toUpperCase() !== 'TEXT') || column.pk || column.dflt_value !== null || column.notnull)) {
                    fail('CREATE TABLE supports plain column names with optional TEXT only');
                }

                mutation.headers = info.map((column) => column.name);
                if (!mutation.headers.length || mutation.headers.length > 100) {
                    fail('CSV requires 1..100 columns');
                }

                const names = mutation.headers.map((name) => name.toLowerCase());

                if (new Set(names).size !== names.length || names.some((name) => [
                    'rowid',
                    '_rowid_',
                    'oid',
                    '_source_path',
                    '_source_record',
                ].includes(name)) || mutation.headers.some((name) => !name.trim() || name.includes('\0'))) {
                    fail('Invalid or reserved CSV column names');
                }

                if (db.prepare(`SELECT count(*) AS n FROM ${quote(mutation.name)}`).get().n !== 0) {
                    fail('CREATE TABLE AS SELECT is unsupported');
                }
            }

            return exportMutation(db, mutation, sources, {
                affectedRows: creating ? 0 : Number(changes),
                dialect: formats.get(mutation.name),
            });
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
        const metadataReserve = Buffer.byteLength(JSON.stringify(sources.map(({ path, hash }) => {
            return {
                path,
                hash,
            };
        }))) + 1024;
        let rowBytes = 0;
        const baseBytes = Buffer.byteLength(JSON.stringify(result));

        stage = 'SQL execution/result conversion';
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

            if (baseBytes + rowBytes + bytes > 262144 - metadataReserve) {
                result.truncated = true;
                result.truncationReason = 'byte_limit';
                break;
            }

            rowBytes += bytes;
            result.rows.push(row);
        }

        if (Buffer.byteLength(JSON.stringify(result)) > 262144 - metadataReserve) {
            fail('Result metadata exceeds output limit');
        }

        return result;
    } finally {
        db.close();
    }
}

/** Same engine protocol for the subprocess and direct engine tests. */
function execute(input) {
    try {
        return { result: query(input) };
    } catch (error) {
        // Never expose raw parser/SQLite messages, which can embed cell contents or SQL.
        const message = error instanceof PublicQueryError ? error.message : `Query rejected during ${stage}; check CSV structure, SQL, parameters and resource limits`;

        return { error: message };
    }
}

module.exports = { execute };

if (require.main === module) {
    // Parent sends bounded immutable snapshots; the worker never opens vault paths.
    const inputChunks = [];
    let inputBytes = 0;

    process.stdin.on('data', (chunk) => {
        inputBytes += chunk.length;
        if (inputBytes > 26000000) {
            process.exit(1);
        }

        inputChunks.push(chunk);
    });
    process.stdin.on('end', () => {
        try {
            const input = JSON.parse(Buffer.concat(inputChunks).toString('utf8'));

            inputChunks.length = 0;
            process.stdout.write(JSON.stringify(execute(input)));
        } catch {
            process.stdout.write(JSON.stringify({ error: 'Invalid CSV query input' }));
        }
    });
}

/** SQLite compilation classifies writes even when the statement starts with WITH. */
function classifyAndPrepare(db, input, sources) {
    const tables = new Map(input.tables.map((table) => [
        table.name.toLowerCase(),
        table,
    ]));
    const reserved = new Set([
        '_source_path',
        '_source_record',
        'rowid',
        '_rowid_',
        'oid',
    ]);
    const canCreate = input.tables.some((table) => !table.headers && Object.hasOwn(table, 'expectedHash'));
    let mutation;
    let creating = false;
    const authorize = (action, first, second, database) => {
        const table = tables.get(first?.toLowerCase());

        // Defensive SQLite forbids direct schema writes; CREATE TABLE needs these internal actions.
        if (creating && action === constants.SQLITE_READ && first === 'sqlite_master') {
            return constants.SQLITE_OK;
        }

        if (canCreate && first === 'sqlite_master' && [
            constants.SQLITE_INSERT,
            constants.SQLITE_UPDATE,
        ].includes(action)) {
            return constants.SQLITE_OK;
        }

        if ([
            constants.SQLITE_INSERT,
            constants.SQLITE_UPDATE,
            constants.SQLITE_DELETE,
            constants.SQLITE_CREATE_TABLE,
        ].includes(action)) {
            if (!table || table.sources.length !== 1 || !Object.hasOwn(table, 'expectedHash') || (database !== 'main' && database !== null)) {
                return constants.SQLITE_DENY;
            }

            if (action === constants.SQLITE_UPDATE && reserved.has(second?.toLowerCase())) {
                return constants.SQLITE_DENY;
            }

            if (action === constants.SQLITE_CREATE_TABLE && table.headers) {
                return constants.SQLITE_DENY;
            }

            if (mutation && mutation !== table) {
                return constants.SQLITE_DENY;
            }

            mutation = table;
            creating ||= action === constants.SQLITE_CREATE_TABLE;

            return constants.SQLITE_OK;
        }

        if (action === constants.SQLITE_SELECT || action === constants.SQLITE_RECURSIVE) {
            return constants.SQLITE_OK;
        }

        if (action === constants.SQLITE_READ && ((database === 'main' && table) || (database === null && !first.toLowerCase().startsWith('sqlite_')))) {
            return constants.SQLITE_OK;
        }

        if (action === constants.SQLITE_FUNCTION && allowedFunctions.has(second)) {
            return constants.SQLITE_OK;
        }

        return constants.SQLITE_DENY;
    };

    stage = 'SQL preparation/authorization';
    db.setAuthorizer(authorize);
    try {
        db.prepare(input.sql);
    } catch { /* Metadata-only reads are retried after adding provenance columns. */ }

    db.setAuthorizer(null);
    for (const table of input.tables) {
        if (!table.headers || table === mutation) {
            continue;
        }

        db.exec(`ALTER TABLE ${quote(table.name)} ADD COLUMN _source_path TEXT NOT NULL DEFAULT ''; ALTER TABLE ${quote(table.name)} ADD COLUMN _source_record TEXT NOT NULL DEFAULT ''`);
        let offset = 0;

        for (const source of sources.filter((candidate) => candidate.table === table.name)) {
            db.prepare(`UPDATE ${quote(table.name)} SET _source_path=?, _source_record=CAST(rowid-? AS TEXT) WHERE rowid>? AND rowid<=?`).run(source.path, BigInt(offset), BigInt(offset), BigInt(offset + source.records));
            offset += source.records;
        }
    }

    if (!mutation) {
        db.exec('PRAGMA query_only=ON');
    }

    db.setAuthorizer(authorize);
    const statement = db.prepare(input.sql);

    if (statement.sourceSQL.trim() !== input.sql.trim()) {
        fail('Exactly one SQL statement is required');
    }

    return {
        statement,
        mutation,
        creating,
    };
}

function exportMutation(db, table, sources, { affectedRows, dialect }) {
    stage = 'CSV export validation';
    const chunks = [
        stringify([table.headers], {
            bom: dialect.bom,
            quoted_match: /^\uFEFF/,
            record_delimiter: dialect.recordDelimiter,
        }),
    ];
    let bytes = Buffer.byteLength(chunks[0]);
    let records = 0;
    const statement = db.prepare(`SELECT ${table.headers.map(quote).join(',')} FROM ${quote(table.name)} ORDER BY rowid`);

    statement.setReturnArrays(true);
    // Reuse the serializer for small batches instead of constructing it for every row.
    // At most 32 bounded records are retained, never the full result set.
    const batch = [];
    const flush = () => {
        if (!batch.length) {
            return;
        }

        const chunk = stringify(batch, { record_delimiter: dialect.recordDelimiter });

        bytes += Buffer.byteLength(chunk);
        if (bytes > 4194304) {
            fail('Edited CSV exceeds 4 MiB');
        }

        chunks.push(chunk);
        batch.length = 0;
    };

    for (const row of statement.iterate()) {
        if (++records > 50000) {
            fail('Edited CSV exceeds 50000 records');
        }

        if (row.some((cell) => typeof cell !== 'string')) {
            fail('Edited CSV cells must be text; NULL and BLOB values are unsupported');
        }

        if (row.reduce((n, cell) => n + Buffer.byteLength(cell), 0) > 65536) {
            fail('Edited CSV record exceeds 64 KiB');
        }

        if (row.some((cell) => cell.includes('\0'))) {
            fail('NUL characters cannot be persisted in CSV');
        }

        batch.push(row);
        if (batch.length === 32) {
            flush();
        }
    }

    flush();
    if (bytes > 4194304) {
        fail('Edited CSV exceeds 4 MiB');
    }

    return {
        columns: [],
        rows: [],
        sources,
        truncated: false,
        truncationReason: null,
        mutation: {
            path: table.sources[0].path,
            table: table.name,
            csv: chunks.join(''),
            affectedRows,
            records,
        },
    };
}

function recordDelimiter(text) {
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '"') {
            if (quoted && text[i + 1] === '"') {
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (!quoted && text[i] === '\r') {
            return text[i + 1] === '\n' ? '\r\n' : '\r';
        } else if (!quoted && text[i] === '\n') {
            return '\n';
        }
    }

    return '\n';
}
