import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { CommandError } from '../../commands/CommandError';
import type { CommandExecution } from '../../commands/CommandExecution';

const HELPER_ERROR_CODES = [
    'conflict',
    'forbidden_path',
] as const;

function helperErrorCode(error: string | undefined) {
    return HELPER_ERROR_CODES.find((code) => code === error) ?? 'command_failed';
}

/** Wait for the helper to exit, including on cancellation, before releasing its descriptors. */
export async function runSecureFilesystem(input: object, execution: CommandExecution, directoryFd?: number): Promise<void> {
    execution.throwIfAborted();
    const child = spawn('python3', [join(__dirname, 'secureFilesystem.py')], {
        stdio: [
            'pipe',
            'pipe',
            'ignore',
            ...directoryFd === undefined ? [] : [directoryFd],
        ],
        env: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            PYTHONDONTWRITEBYTECODE: '1',
        },
    });

    await new Promise<void>((resolve, reject) => {
        let output = '';
        let failure: unknown;
        const stop = (error: unknown) => {
            failure ??= error;
            child.kill('SIGKILL');
        };
        const abort = () => stop(execution.signal.reason);
        const timer = setTimeout(() => stop(new CommandError('command_failed', 'Secure filesystem operation exceeded 30 seconds')), 30000);

        execution.signal.addEventListener('abort', abort, { once: true });
        if (execution.signal.aborted) {
            abort();
        }

        child.stdout?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
            output += chunk;
            if (output.length > 16000) {
                stop(new CommandError('command_failed', 'Secure filesystem helper exceeded its output limit'));
            }
        });
        child.stdin?.on('error', (error) => {
            failure ??= error;
        });
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

            try {
                const result = JSON.parse(output) as { ok?: boolean; error?: string; message?: string };

                if (code !== 0 || result.ok !== true) {
                    throw new CommandError(helperErrorCode(result.error), result.message ?? 'Secure filesystem operation failed');
                }

                resolve();
            } catch (error) {
                reject(error);
            }
        });
        child.stdin?.end(JSON.stringify(input));
    });
}
