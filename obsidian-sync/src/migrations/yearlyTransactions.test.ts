import { gunzipSync } from 'node:zlib';
import {
    mkdtemp, mkdir, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import {
    finalizeYearlyTransactions, migrateYearlyTransactions, planYearlyTransactions,
} from './yearlyTransactions';

const columns = [
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
const row = (description: string, occurred: string, value: string, reference: string) => {
    const cells = Array<string>(18).fill('');

    cells[1] = value;
    cells[2] = description;
    cells[6] = reference;
    cells[10] = 'account-001';
    cells[12] = 'import-xyz';
    cells[13] = occurred;

    return cells;
};
const rows = [
    row('historical', '2019-12-31', '', '1'),
    row('newest', '2026-01-05', '', '2'),
    row('2025 fallback', '', '2025-09-01', '3'),
    row('identical', '2026-01-05', '', '4'),
    row('identical', '2026-01-05', '', '4'),
    row('multi\nline, café 🍂', '', '2026-11-07T10:00', '5'),
];
const original = Buffer.from(stringify([
    columns,
    ...rows,
]));
const params = '{"sort":[{"expression":"occurred_datetime","direction":"DESC"}]}';
let vaultRoot: string;
let financeDir: string;
let backupDir: string;

beforeEach(async () => {
    vaultRoot = await mkdtemp(join(tmpdir(), 'csv-yearly-migration-'));
    financeDir = join(vaultRoot, '@senaev/finances/transactions');
    backupDir = join(vaultRoot, '@senaev/finances/transactions-backup');
    await mkdir(financeDir, { recursive: true });
    await writeFile(join(financeDir, 'transactions.csv'), original);
    await writeFile(join(financeDir, 'transactions.csv.params.json'), params);
});

afterEach(async () => {
    await rm(vaultRoot, {
        recursive: true,
        force: true,
    });
});

describe('yearly transaction migration', () => {
    it('keeps all cells, repeats, multiline text, and original order on equal timestamps', () => {
        const plan = planYearlyTransactions(original);

        expect(plan.records).toBe(6);
        expect(plan.files.map(({ year, rows: count }) => [
            year,
            count,
        ])).toEqual([
            [
                '2019',
                1,
            ],
            [
                '2025',
                1,
            ],
            [
                '2026',
                4,
            ],
        ]);
        const yearly2026 = plan.files.find(({ year }) => year === '2026')!;
        const parsed = parse(yearly2026.text) as string[][];

        expect(parsed.slice(1).map((record) => record[2])).toEqual([
            'multi\nline, café 🍂',
            'newest',
            'identical',
            'identical',
        ]);
        expect(gunzipSync(plan.backup)).toEqual(original);
    });

    it('stages a byte-perfect compressed backup and yearly files, then finalizes separately', async () => {
        const preview = await migrateYearlyTransactions(vaultRoot);

        expect(preview.staged).toBe(false);
        expect(await readFile(join(financeDir, 'transactions.csv'))).toEqual(original);

        const staged = await migrateYearlyTransactions(vaultRoot, true);

        expect(staged.staged).toBe(true);
        expect(await readFile(join(financeDir, 'transactions.csv'))).toEqual(original);
        expect(gunzipSync(await readFile(staged.backupPath))).toEqual(original);
        expect(await readFile(join(backupDir, 'transactions.csv.params.json'), 'utf8')).toBe(params);
        expect((await readFile(join(financeDir, 'csv.params.json'), 'utf8'))).toContain('COALESCE(NULLIF(occurred_datetime');
        expect((await finalizeYearlyTransactions(vaultRoot))).toMatchObject({
            finalized: true,
            records: 6,
        });
        await expect(readFile(join(financeDir, 'transactions.csv'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(readFile(join(financeDir, 'transactions.csv.params.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(gunzipSync(await readFile(staged.backupPath))).toEqual(original);
    });

    it('refuses to finalize when a yearly file changed after staging', async () => {
        await migrateYearlyTransactions(vaultRoot, true);
        await writeFile(join(financeDir, '2025.csv'), 'corrupt');

        await expect(finalizeYearlyTransactions(vaultRoot)).rejects.toThrow('differs');
        expect(await readFile(join(financeDir, 'transactions.csv'))).toEqual(original);
    });

    it('refuses invalid dates before making any changes', () => {
        const invalid = Buffer.from(stringify([
            columns,
            row('undated', '', '', '1'),
        ]));

        expect(() => planYearlyTransactions(invalid)).toThrow('invalid or missing date');
    });
});
