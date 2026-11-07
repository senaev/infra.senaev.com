import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
    access, copyFile, mkdir, readFile, readdir, unlink, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const REGISTER = '@senaev/finances/transactions';
const EXPECTED_COLUMNS = [
    'transaction_datetime',
    'value_datetime',
    'description',
    'amount',
    'balance',
    'currency',
    'source_excel_row',
    'agent_comment',
    'transaction_type',
    'category',
    'account_id',
    'card_last4',
    'import_id',
    'occurred_datetime',
    'original_amount',
    'original_currency',
    'source_page',
    'source_record',
];
const SORT_EXPRESSION = 'COALESCE(NULLIF(occurred_datetime, \'\'), NULLIF(value_datetime, \'\'), NULLIF(transaction_datetime, \'\'))';
const SYNC_MAX_BYTES = 5_000_000;
const sha256 = (input: Buffer | string) => createHash('sha256').update(input).digest('hex');

type Row = string[];

type YearlyFile = { year: string; text: string; rows: number; size: number; hash: string };

function decodedRows(text: string): Row[] {
    return parse(text, {
        bom: true,
        skip_empty_lines: false,
    }) as Row[];
}

function rowFingerprint(rows: Row[]): string {
    return sha256(rows.map((row) => JSON.stringify(row)).sort().join('\n'));
}

function dateOf(row: Row): string {
    const date = row[13] || row[1] || row[0] || '';

    if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/u.test(date)) {
        throw new Error('Cannot partition a transaction with an invalid or missing date');
    }

    return date;
}

/** Prepares and verifies the complete migration without modifying any file. */
export function planYearlyTransactions(original: Buffer) {
    const hasBom = original.subarray(0, 3).equals(Buffer.from([
        0xef,
        0xbb,
        0xbf,
    ]));
    const input = new TextDecoder('utf-8', { fatal: true }).decode(original);
    const [
        header,
        ...rows
    ] = decodedRows(input);

    if (JSON.stringify(header) !== JSON.stringify(EXPECTED_COLUMNS)) {
        throw new Error('Unexpected CSV columns or column order; migration refused');
    }

    if (header === undefined || rows.some((row) => row.length !== header.length)) {
        throw new Error('CSV contains a record with the wrong number of columns');
    }

    const years = new Map<string, { row: Row; date: string; index: number }[]>();

    for (const [
        index,
        row,
    ] of rows.entries()) {
        const date = dateOf(row);
        const year = date.slice(0, 4);
        const bucket = years.get(year) ?? [];

        bucket.push({
            row,
            date,
            index,
        });
        years.set(year, bucket);
    }

    const files: YearlyFile[] = [...years].sort(([a], [b]) => a.localeCompare(b)).map(([
        year,
        bucket,
    ]) => {
        // The original position is the tie-breaker: identical timestamps remain in original order.
        bucket.sort((a, b) => {
            if (a.date === b.date) {
                return a.index - b.index;
            }

            return a.date < b.date ? 1 : -1;
        });
        const text = stringify([
            header,
            ...bucket.map(({ row }) => row),
        ], { bom: hasBom });
        const decoded = decodedRows(text);

        if (rowFingerprint(decoded.slice(1)) !== rowFingerprint(bucket.map(({ row }) => row))) {
            throw new Error(`Round-trip verification failed for year ${year}`);
        }

        const size = Buffer.byteLength(text);

        if (size >= SYNC_MAX_BYTES) {
            throw new Error(`Year ${year} is too large for Obsidian Sync: ${size} bytes`);
        }

        return {
            year,
            text,
            size,
            rows: bucket.length,
            hash: sha256(text),
        };
    });

    if (rowFingerprint(files.flatMap(({ text }) => decodedRows(text).slice(1))) !== rowFingerprint(rows)) {
        throw new Error('Transaction multiset verification failed: values or duplicates were lost');
    }

    const backup = gzipSync(original, { level: 9 });

    if (backup.length >= SYNC_MAX_BYTES || !gunzipSync(backup).equals(original)) {
        throw new Error('Original archive is too large or does not decompress byte-for-byte');
    }

    return {
        originalHash: sha256(original),
        originalSize: original.length,
        records: rows.length,
        files,
        backup,
        params: `${JSON.stringify({
            sort: [
                {
                    expression: SORT_EXPRESSION,
                    direction: 'DESC',
                },
            ],
        }, null, 2)}\n`,
    };
}

/** Stages all files and an independently checked archive; never removes the original. */
export async function migrateYearlyTransactions(vaultRoot: string, apply = false) {
    const folder = join(vaultRoot, REGISTER);
    const adjacentBackup = join(vaultRoot, '@senaev/finances/transactions-backup');
    const originalPath = join(folder, 'transactions.csv');
    const originalParams = join(folder, 'transactions.csv.params.json');
    const original = await readFile(originalPath);
    const plan = planYearlyTransactions(original);
    const backupPath = join(adjacentBackup, `transactions-${plan.originalHash.slice(0, 12)}.csv.gz`);
    const newParams = join(folder, 'csv.params.json');
    const targets = [
        backupPath,
        newParams,
        ...plan.files.map(({ year }) => join(folder, `${year}.csv`)),
    ];
    const entries = await readdir(folder);

    if (entries.some((entry) => /^\d{4}\.csv$/u.test(entry))) {
        throw new Error('Yearly CSV files already exist; refusing a partial or repeated migration');
    }

    for (const target of targets) {
        try {
            await access(target);
            throw new Error(`Destination already exists: ${target}`);
        } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
                throw error;
            }
        }
    }

    if (!apply) {
        return {
            staged: false,
            ...plan,
            backup: undefined,
            backupPath,
        };
    }

    // All writes happen only after the plan and its round-trip checks are complete.
    await mkdir(adjacentBackup, { recursive: true });
    await writeFile(backupPath, plan.backup, { flag: 'wx' });
    if (!gunzipSync(await readFile(backupPath)).equals(original)) {
        throw new Error('Backup verification failed; original is untouched');
    }

    const archivedParams = join(adjacentBackup, 'transactions.csv.params.json');
    let paramsArchived = false;

    try {
        await copyFile(originalParams, archivedParams, constants.COPYFILE_EXCL);
        paramsArchived = true;
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            throw error;
        }
    }

    for (const file of plan.files) {
        const path = join(folder, `${file.year}.csv`);

        await writeFile(path, file.text, { flag: 'wx' });
        if (sha256(await readFile(path)) !== file.hash) {
            throw new Error(`New CSV verification failed: ${path}; original is untouched`);
        }
    }

    await writeFile(newParams, plan.params, { flag: 'wx' });
    const recovered: Row[] = [];

    for (const file of plan.files) {
        recovered.push(...decodedRows(await readFile(join(folder, `${file.year}.csv`), 'utf8')).slice(1));
    }

    const [
        , ...oldRows
    ] = decodedRows(new TextDecoder('utf-8', { fatal: true }).decode(original));

    if (recovered.length !== oldRows.length || rowFingerprint(recovered) !== rowFingerprint(oldRows)) {
        throw new Error('Final reread verification failed; original is untouched');
    }

    if (sha256(await readFile(originalPath)) !== plan.originalHash) {
        throw new Error('Original changed during migration; refusing to remove it');
    }

    // Do not remove the oversized original until the owner confirms every new file and
    // its archive have reached another device through Obsidian Sync.
    return {
        staged: true,
        ...plan,
        backup: undefined,
        backupPath,
        paramsArchived,
    };
}

/** Finalize a fully staged and independently synced migration. */
export async function finalizeYearlyTransactions(vaultRoot: string) {
    const folder = join(vaultRoot, REGISTER);
    const adjacentBackup = join(vaultRoot, '@senaev/finances/transactions-backup');
    const originalPath = join(folder, 'transactions.csv');
    const original = await readFile(originalPath);
    const plan = planYearlyTransactions(original);
    const backupPath = join(adjacentBackup, `transactions-${plan.originalHash.slice(0, 12)}.csv.gz`);

    if (!gunzipSync(await readFile(backupPath)).equals(original)) {
        throw new Error('Original archive differs; refusing to finalize');
    }

    if (await readFile(join(folder, 'csv.params.json'), 'utf8') !== plan.params) {
        throw new Error('Folder sorting policy has changed; refusing to finalize');
    }

    const existing = (await readdir(folder)).filter((name) => /^\d{4}\.csv$/u.test(name)).sort();
    const expected = plan.files.map(({ year }) => `${year}.csv`).sort();

    if (JSON.stringify(existing) !== JSON.stringify(expected)) {
        throw new Error('Yearly file set differs from planned dataset');
    }

    const recovered: Row[] = [];

    for (const file of plan.files) {
        const contents = await readFile(join(folder, `${file.year}.csv`), 'utf8');

        if (sha256(contents) !== file.hash) {
            throw new Error(`Yearly file differs from planned dataset: ${file.year}`);
        }

        recovered.push(...decodedRows(contents).slice(1));
    }

    const oldRows = decodedRows(new TextDecoder('utf-8', { fatal: true }).decode(original)).slice(1);

    if (recovered.length !== oldRows.length || rowFingerprint(recovered) !== rowFingerprint(oldRows)) {
        throw new Error('Final reconstruction differs from original; refusing to finalize');
    }

    if (sha256(await readFile(originalPath)) !== plan.originalHash) {
        throw new Error('Original changed before finalization; refusing to remove it');
    }

    // Exactly the same original bytes remain stored in the adjacent compressed archive.
    await unlink(originalPath);
    try {
        const sidecar = join(folder, 'transactions.csv.params.json');
        const archived = join(adjacentBackup, 'transactions.csv.params.json');

        if ((await readFile(sidecar)).equals(await readFile(archived))) {
            await unlink(sidecar);
        }
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            throw error;
        }
    }

    return {
        finalized: true,
        records: plan.records,
        files: expected,
        backupPath,
        originalHash: plan.originalHash,
    };
}
