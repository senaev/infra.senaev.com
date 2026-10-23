import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { CommandError } from '../../commands/CommandError';
import type { CommandExecution } from '../../commands/CommandExecution';

const HELPER_ERROR_CODES = [
    'conflict',
    'forbidden_path',
    'file_too_large',
] as const;

function helperErrorCode(error: string | undefined) {
    return HELPER_ERROR_CODES.find((code) => code === error) ?? 'command_failed';
}

export const SECURE_FILESYSTEM_HELPER = join(__dirname, 'secureFilesystem.py');

/** Wait for the helper to exit, including on cancellation, before releasing its descriptors. */
export async function runSecureFilesystem<T = void>(input: object, execution: CommandExecution, directoryFd?: number, maxOutputChars = 16000): Promise<T> {
    execution.throwIfAborted();
    const child = spawn('python3', [SECURE_FILESYSTEM_HELPER], {
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

    return await new Promise<T>((resolve, reject) => {
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
            if (output.length > maxOutputChars) {
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
                const result = JSON.parse(output) as { ok?: boolean; error?: string; message?: string; result?: T; details?: Record<string, unknown> | null };

                if (code !== 0 || result.ok !== true) {
                    throw new CommandError(helperErrorCode(result.error), result.message ?? 'Secure filesystem operation failed', result.details ?? undefined);
                }

                resolve(result.result as T);
            } catch (error) {
                reject(error);
            }
        });
        child.stdin?.end(JSON.stringify(input));
    });
}
