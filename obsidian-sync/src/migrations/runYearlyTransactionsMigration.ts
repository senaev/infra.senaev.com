import { OBSIDIAN_VAULT_PATH } from '../env';

import { finalizeYearlyTransactions, migrateYearlyTransactions } from './yearlyTransactions';

const stage = process.argv.includes('--stage');
const finalize = process.argv.includes('--finalize');

if (stage && finalize) {
    throw new Error('Choose either --stage or --finalize');
}

const operation = finalize
    ? finalizeYearlyTransactions(OBSIDIAN_VAULT_PATH)
    : migrateYearlyTransactions(OBSIDIAN_VAULT_PATH, stage);

operation.then((result) => {
    // Do not emit transaction values in logs.
    process.stdout.write(`${JSON.stringify({
        staged: 'staged' in result ? result.staged : false,
        finalized: 'finalized' in result ? result.finalized : false,
        originalHash: result.originalHash,
        backupPath: result.backupPath,
        records: result.records,
        years: result.files.map((file) => typeof file === 'string'
            ? file
            : {
                year: file.year,
                rows: file.rows,
                size: file.size,
                hash: file.hash,
            }),
    }, null, 2)}\n`);
}).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
