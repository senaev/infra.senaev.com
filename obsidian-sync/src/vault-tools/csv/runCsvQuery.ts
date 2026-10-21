import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

import { CommandError } from 'senaev-utils/src/commands/CommandError';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';

export type CsvQueryInput = {
    tables: { name: string; sources: { path: string; text: string; hash: string; size: number }[] }[];
    sql: string;
    params: (string | null)[];
    maxRows: number;
};

export type CsvQueryResult = {
    columns: { name: string; declaredType: string | null }[];
    rows: (string | number | null)[][];
    sources: { table: string; path: string; hash: string; size: number; records: number }[];
    truncated: boolean;
    truncationReason: 'row_limit' | 'byte_limit' | null;
};

/** Keep synchronous SQLite off the server event loop; always reap before releasing admission. */
export async function runCsvQuery(input: CsvQueryInput, execution: CommandExecution): Promise<CsvQueryResult> {
    execution.throwIfAborted();
    const worker = join(__dirname, 'queryWorker.cjs');
    const parser = dirname(dirname(dirname(createRequire(__filename).resolve('csv-parse/sync'))));
    const child = spawn(process.execPath, [
        '--permission',
        `--allow-fs-read=${worker}`,
        `--allow-fs-read=${parser}`,
        '--max-old-space-size=64',
        '--disable-proto=throw',
        worker,
    ], {
        env: { NODE_NO_WARNINGS: '1' },
        stdio: [
            'pipe',
            'pipe',
            'ignore',
        ],
    });

    return await new Promise((resolve, reject) => {
        let output = '';
        let failure: unknown;
        const stop = (error: unknown) => {
            failure ??= error;
            child.kill('SIGKILL');
        };
        const abort = () => stop(execution.signal.reason);
        const timer = setTimeout(() => stop(new CommandError('command_failed', 'CSV query exceeded its 5 second deadline')), 5000);

        execution.signal.addEventListener('abort', abort, { once: true });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            output += chunk;
            if (Buffer.byteLength(output) > 263000) {
                stop(new CommandError('command_failed', 'CSV query exceeded its output limit'));
            }
        });
        child.stdin.on('error', () => stop(new CommandError('command_failed', 'CSV query subprocess closed its input')));
        child.on('error', (error) => {
            failure ??= error;
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            execution.signal.removeEventListener('abort', abort);
            if (failure !== undefined) {
                reject(failure);

                return;
            }

            if (code !== 0) {
                reject(new CommandError('command_failed', 'CSV query subprocess failed or exceeded resource limits'));

                return;
            }

            try {
                const reply = JSON.parse(output) as { error?: string; result?: CsvQueryResult };

                if (reply.error !== undefined || reply.result === undefined) {
                    throw new CommandError('invalid_arguments', reply.error ?? 'CSV query returned an invalid result');
                }

                resolve(reply.result);
            } catch (error) {
                reject(error);
            }
        });
        if (execution.signal.aborted) {
            abort();
        } else {
            child.stdin.end(JSON.stringify(input));
        }
    });
}
