import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { readToolArguments, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';

import { normalizeVaultPath } from '../access/vaultAccess';
import { readDownloadFile } from '../access/readDownloadBytes';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
import { publishCsv } from '../csv/publishCsv';
import { readCsvParams } from '../csv/readCsvParams';
import { assertFilePath } from '../access/vaultFiles';
import { runCsvQuery, type CsvQueryInput } from '../csv/runCsvQuery';

let activeQueries = 0;

export function parseCsvQuery(input: unknown) {
    const args = readVaultToolArguments(input, 'csv_query');
    const sql = requiredNonEmptyString(args, 'sql');

    if (sql.length > 16000 || sql.includes('\0')) {
        throw invalidArguments('SQL must be at most 16000 characters without NUL');
    }

    if (!Array.isArray(args.tables) || args.tables.length < 1 || args.tables.length > 8) {
        throw invalidArguments('tables requires 1..8 entries');
    }

    const names = new Set<string>();
    let files = 0;
    const tables = args.tables.map((value: unknown) => {
        const table = readToolArguments(value, [
            'name',
            'paths',
            'expectedHash',
        ]);
        const name = requiredNonEmptyString(table, 'name');

        if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name) || name.toLowerCase().startsWith('sqlite_') || names.has(name.toLowerCase())) {
            throw invalidArguments('Table names must be unique SQL identifiers, excluding sqlite_ names');
        }

        names.add(name.toLowerCase());
        if (!Array.isArray(table.paths) || table.paths.length < 1 || table.paths.length > 8) {
            throw invalidArguments('Each table requires 1..8 CSV paths');
        }

        const paths = table.paths.map((path: unknown) => {
            if (typeof path !== 'string' || path.length > 1024) {
                throw invalidArguments('CSV paths must be strings up to 1024 characters');
            }

            const normalized = normalizeVaultPath(path, 'paths');

            if (!normalized.toLowerCase().endsWith('.csv')) {
                throw invalidArguments('Only .csv files are supported');
            }

            return normalized;
        });

        if (new Set(paths).size !== paths.length) {
            throw invalidArguments('Duplicate paths within a table are not allowed');
        }

        const { expectedHash } = table;

        if (expectedHash !== undefined && (paths.length !== 1 || (expectedHash !== null && (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash))))) {
            throw invalidArguments('expectedHash requires one CSV path and a lowercase SHA-256 digest, or null to create a missing file');
        }

        files += paths.length;

        return {
            name,
            paths,
            ...expectedHash === undefined ? {} : { expectedHash: expectedHash as string | null },
        };
    });

    const allPaths = tables.flatMap((table) => table.paths);

    if (new Set(allPaths).size !== allPaths.length) {
        throw invalidArguments('Map each CSV path once; use SQL aliases for self joins');
    }

    if (files > 8) {
        throw invalidArguments('At most 8 CSV files are allowed');
    }

    const params = args.params === undefined ? [] : args.params;
    const maxRows = args.maxRows === undefined ? 200 : args.maxRows;

    if (!Array.isArray(params) || params.length > 100 || params.some((value) => value !== null && (typeof value !== 'string' || value.length > 65536))) {
        throw invalidArguments('params must contain at most 100 strings (up to 65536 characters) or null values');
    }

    if (Buffer.byteLength(JSON.stringify(params)) > 65536) {
        throw invalidArguments('Serialized params must fit within 64 KiB total');
    }

    if (typeof maxRows !== 'number' || !Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000) {
        throw invalidArguments('maxRows must be 1..1000');
    }

    return {
        tables,
        sql,
        params: params as (string | null)[],
        maxRows,
    };
}

const executeCsvQuery = createCommandAdapter(parseCsvQuery, async (config: VaultToolsConfig, input, execution) => {
    if (activeQueries !== 0) {
        throw new CommandError('conflict', 'CSV query capacity is busy; retry shortly', {
            reason: 'csv_query_capacity',
            retryable: true,
        });
    }

    activeQueries++;
    const start = performance.now();

    const observed: { path: string; hash: string | null }[] = [];

    try {
        let bytes = 0;
        const originals = new Map<string, string>();
        const paramsHashes = new Map<string, string | null>();
        const tables: CsvQueryInput['tables'] = [];

        for (const table of input.tables) {
            const sources: CsvQueryInput['tables'][number]['sources'] = [];

            for (const path of table.paths) {
                assertFilePath(config, path);
                const source = await readDownloadFile(config, path, execution, {
                    offset: 0,
                    length: 10 * 1024 * 1024 - bytes,
                    maxBytes: 10 * 1024 * 1024 - bytes,
                }).catch((error: unknown) => {
                    if (table.expectedHash === null && error instanceof CommandError && error.code === 'not_found') {
                        return {
                            bytes: Buffer.alloc(0),
                            hash: null,
                            size: 0,
                        };
                    }

                    throw error;
                });

                observed.push({
                    path,
                    hash: source.hash,
                });
                if (table.expectedHash !== undefined && table.expectedHash !== source.hash) {
                    throw new CommandError('conflict', 'CSV changed or already exists; use its current hash', { hash: source.hash });
                }

                bytes += source.size;
                if (bytes > 10 * 1024 * 1024) {
                    throw invalidArguments('CSV inputs exceed 10 MiB total');
                }

                let text: string;

                try {
                    text = new TextDecoder('utf-8', {
                        fatal: true,
                        ignoreBOM: true,
                    }).decode(source.bytes);
                } catch {
                    throw invalidArguments('CSV must be valid UTF-8');
                }

                if (text.includes('\0')) {
                    throw invalidArguments('CSV must not contain NUL characters');
                }

                originals.set(path, text);
                sources.push({
                    path,
                    text,
                    hash: source.hash,
                    size: source.size,
                });
            }

            const csvParams = table.expectedHash === undefined ? undefined : await readCsvParams(config, table.paths[0]!, execution);

            if (csvParams) {
                paramsHashes.set(table.paths[0]!, csvParams.hash);
            }

            tables.push({
                ...csvParams?.text === undefined ? {} : { paramsText: csvParams.text },
                name: table.name,
                sources,
                ...table.expectedHash === undefined ? {} : { expectedHash: table.expectedHash },
            });
        }

        const result = await runCsvQuery({
            ...input,
            tables,
        }, execution);

        execution.throwIfAborted();
        const { mutation, ...reply } = result;
        let publication;

        if (mutation) {
            const table = input.tables.find((candidate) => candidate.name === mutation.table);
            const original = originals.get(mutation.path);

            if (!table || table.expectedHash === undefined || original === undefined || table.paths.length !== 1 || table.paths[0] !== mutation.path) {
                throw new CommandError('command_failed', 'Invalid CSV mutation result');
            }

            // Zero matched rows preserve formatting; schema changes always publish their headers.
            const csv = !mutation.schemaChanged && mutation.affectedRows === 0 ? original : mutation.csv;

            publication = await publishCsv(config, {
                path: mutation.path,
                expectedHash: table.expectedHash,
                original,
                csv,
                paramsHash: paramsHashes.get(mutation.path)!,
            }, execution);
            for (const source of reply.sources) {
                if (source.path === mutation.path) {
                    Object.assign(source, {
                        hash: publication.hash,
                        size: publication.size,
                        records: mutation.records,
                    });
                }
            }
        }

        const hashes = reply.sources.map(({ path, hash }) => {
            return {
                path,
                hash,
            };
        });

        return {
            ...reply,
            changed: publication?.changed ?? false,
            ...publication,
            hashes,
            ...hashes.length === 1 ? { hash: hashes[0]?.hash } : {},
            ...mutation ? { affectedRows: mutation.affectedRows } : {},
            durationMs: Math.round(performance.now() - start),
        };
    } catch (error) {
        if (error instanceof CommandError && observed.length) {
            const hashes: { path: string; hash: string | null }[] = [];

            for (const { path } of observed) {
                try {
                    hashes.push({
                        path,
                        hash: (await readDownloadFile(config, path, execution, {
                            offset: 0,
                            length: 0,
                            maxBytes: 10485760,
                        })).hash,
                    });
                } catch {
                    hashes.push({
                        path,
                        hash: null,
                    });
                }
            }

            throw new CommandError(error.code, error.message, {
                ...error.details,
                hashes,
                ...hashes.length === 1 ? { hash: hashes[0]?.hash } : {},
            });
        }

        throw error;
    } finally {
        activeQueries--;
    }
});

/** Validation failures still use the common hash response shape; inaccessible files have no disclosed hash. */
export const csvQueryTool: typeof executeCsvQuery = async (...args) => {
    try {
        return await executeCsvQuery(...args);
    } catch (error) {
        if (error instanceof CommandError) {
            throw new CommandError(error.code, error.message, {
                hashes: [],
                hash: null,
                ...error.details,
            });
        }

        throw error;
    }
};
