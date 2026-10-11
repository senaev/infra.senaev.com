import { spawn } from 'node:child_process';
import { once } from 'node:events';

import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { installGracefulShutdown } from './installGracefulShutdown';

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('installGracefulShutdown', () => {
    it('handles a real child-process SIGTERM only after its cleanup completes', async () => {
        const helper = new URL('./installGracefulShutdown.ts', import.meta.url).href;
        const child = spawn(process.execPath, [
            '--input-type=module',
            '-e',
            `
            import { installGracefulShutdown } from ${JSON.stringify(helper)};
            const keepAlive = setInterval(() => {}, 1000);
            installGracefulShutdown({
                stop: async () => {
                    await new Promise(resolve => setTimeout(resolve, 30));
                    process.stdout.write('cleaned');
                    clearInterval(keepAlive);
                },
                reportError: error => { process.stderr.write('shutdown-error:' + String(error)); }
            });
            process.stdout.write('ready');
        `,
        ], {
            stdio: [
                'ignore',
                'pipe',
                'pipe',
            ],
        });
        let stdout = '';
        let stderr = '';
        let ready: () => void = () => undefined;
        const started = new Promise<void>((resolve) => {
            ready = resolve;
        });
        const closed = once(child, 'close');

        child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
            stdout += chunk;
            if (stdout.includes('ready')) {
                ready();
            }
        });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
            stderr += chunk;
        });

        try {
            await Promise.race([
                started,
                closed.then(() => {
                    throw new Error(`Child exited before readiness: ${stderr}`);
                }),
            ]);

            child.kill('SIGTERM');
            expect(await closed).toEqual([
                0,
                null,
            ]);
            expect(stdout).toBe('readycleaned');
            expect(stderr).not.toContain('shutdown-error:');
        } finally {
            if (child.exitCode === null && child.signalCode === null) {
                child.kill('SIGKILL');
                await closed;
            }
        }
    }, 15000);

    it('aborts once and awaits cleanup before exit, including reentrant signals', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const stop = vi.fn(() => gate);
        const lifecycle = installGracefulShutdown({
            stop,
            reportError: vi.fn(),
        });

        lifecycle.signal.addEventListener('abort', () => {
            void lifecycle.shutdown();
        });
        const pending = lifecycle.shutdown();

        expect(lifecycle.shutdown()).toBe(pending);
        await Promise.resolve();
        expect(lifecycle.signal.aborted).toBe(true);
        expect(stop).toHaveBeenCalledTimes(1);
        expect(exit).not.toHaveBeenCalled();
        release();
        await pending;
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
        lifecycle.dispose();
    });

    it('reports cleanup failures and exits unsuccessfully', async () => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        const error = new Error('cleanup');
        const reportError = vi.fn();
        const lifecycle = installGracefulShutdown({
            stop: () => Promise.reject(error),
            reportError,
        });

        await lifecycle.shutdown();
        expect(reportError).toHaveBeenCalledWith(error);
        expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('bounds uncooperative cleanup with the existing ten second process grace', async () => {
        vi.useFakeTimers();
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        let release: () => void = () => undefined;
        const lifecycle = installGracefulShutdown({
            stop: () => new Promise<void>((resolve) => {
                release = resolve;
            }),
            reportError: vi.fn(() => {
                throw new Error('diagnostics');
            }),
        });
        const pending = lifecycle.shutdown();

        await vi.advanceTimersByTimeAsync(9999);
        expect(exit).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(exit).toHaveBeenCalledWith(1);
        release();
        await pending;
        expect(vi.getTimerCount()).toBe(0);
    });
});
