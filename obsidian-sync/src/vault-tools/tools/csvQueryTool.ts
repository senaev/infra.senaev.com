import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { readToolArguments, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';

import { normalizeVaultPath } from '../access/vaultAccess';
import { readDownloadFile } from '../access/readDownloadBytes';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
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

        files += paths.length;

        return {
            name,
            paths,
        };
    });

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

export const csvQueryTool = createCommandAdapter(parseCsvQuery, async (config: VaultToolsConfig, input, execution) => {
    if (activeQueries !== 0) {
        throw new CommandError('conflict', 'CSV query capacity is busy; retry shortly', {
            reason: 'csv_query_capacity',
            retryable: true,
        });
    }

    activeQueries++;
    const start = performance.now();

    try {
        let bytes = 0;
        const tables: CsvQueryInput['tables'] = [];

        for (const table of input.tables) {
            const sources: CsvQueryInput['tables'][number]['sources'] = [];

            for (const path of table.paths) {
                const source = await readDownloadFile(config, path, execution, {
                    offset: 0,
                    length: 4 * 1024 * 1024 - bytes,
                    maxBytes: 4 * 1024 * 1024 - bytes,
                });

                bytes += source.size;
                if (bytes > 4 * 1024 * 1024) {
                    throw invalidArguments('CSV inputs exceed 4 MiB total');
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

                sources.push({
                    path,
                    text,
                    hash: source.hash,
                    size: source.size,
                });
            }

            tables.push({
                name: table.name,
                sources,
            });
        }

        const result = await runCsvQuery({
            ...input,
            tables,
        }, execution);

        execution.throwIfAborted();

        return {
            ...result,
            durationMs: Math.round(performance.now() - start),
        };
    } finally {
        activeQueries--;
    }
});
