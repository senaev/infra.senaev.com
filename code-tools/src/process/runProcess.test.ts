import { tmpdir } from 'node:os';

import {
    describe, expect, it,
} from 'vitest';

import { runProcess } from './runProcess';

function bash(command: string, options: { timeoutMs?: number; maxOutputChars?: number; keep?: 'end' | 'start' } = {}) {
    return runProcess('bash', [
        '-c',
        command,
    ], {
        cwd: tmpdir(),
        timeoutMs: options.timeoutMs ?? 10_000,
        maxOutputChars: options.maxOutputChars ?? 1000,
        ...options.keep !== undefined && { keep: options.keep },
    });
}

describe('runProcess', () => {
    it('returns the exit code, stdout and stderr', async () => {
        const result = await bash('echo out; echo err >&2; exit 3');

        expect(result).toMatchObject({
            exitCode: 3,
            stdout: 'out\n',
            stderr: 'err\n',
            timedOut: false,
            outputTruncated: false,
        });
    });

    it('keeps the end of a long output', async () => {
        const result = await bash('seq 1 10000', { maxOutputChars: 20 });

        expect(result.stdout).toHaveLength(20);
        expect(result.stdout.endsWith('9999\n10000\n')).toBe(true);
        expect(result.outputTruncated).toBe(true);
    });

    it('keeps the start of a long output when asked, and stops the process', async () => {
        const result = await bash('yes', {
            maxOutputChars: 10,
            keep: 'start',
        });

        expect(result.stdout).toBe('y\ny\ny\ny\ny\n');
        expect(result.outputTruncated).toBe(true);
    });

    it('kills the whole process group on timeout', async () => {
        const result = await bash('sleep 30 & sleep 30', { timeoutMs: 300 });

        expect(result.timedOut).toBe(true);
        expect(result.durationMs).toBeLessThan(5000);
    });

    it('does not spawn when already aborted', async () => {
        const controller = new AbortController();
        const reason = new Error('cancelled');

        controller.abort(reason);
        await expect(runProcess('missing-executable', [], {
            cwd: tmpdir(),
            signal: controller.signal,
            maxOutputChars: 100,
        })).rejects.toBe(reason);
    });

    it('escalates cancellation for the whole process group and waits for stream cleanup', async () => {
        const controller = new AbortController();
        const reason = new Error('cancelled');
        const started = performance.now();
        const streams: string[] = [];
        const result = runProcess('bash', [
            '-c',
            'trap \'\' TERM; (trap \'\' TERM; sleep 30) & echo ready; echo diagnostic >&2; wait',
        ], {
            cwd: tmpdir(),
            signal: controller.signal,
            maxOutputChars: 1000,
            onOutput: (stream, text) => {
                streams.push(stream);
                if (text.includes('ready')) {
                    controller.abort(reason);
                }
            },
        });

        await expect(result).rejects.toBe(reason);
        expect(performance.now() - started).toBeGreaterThanOrEqual(900);
        expect(performance.now() - started).toBeLessThan(4000);
        expect(streams).toContain('stdout');
        expect(streams).toContain('stderr');
    });

    it('does not wait for input', async () => {
        const result = await bash('read line; echo "got:$line"');

        expect(result.stdout).toBe('got:\n');
    });
});
