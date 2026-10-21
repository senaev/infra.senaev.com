import { spawn } from 'node:child_process';
import { once } from 'node:events';

import { expect, it } from 'vitest';

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
