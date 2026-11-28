import {
    describe, expect, it,
} from 'vitest';

import { runCommand } from './runCommand';

describe('runCommand', () => {
    it('returns stdout, stderr and the exit code', async () => {
        await expect(runCommand({
            argv: [
                '/bin/sh',
                '-c',
                'printf out; printf err >&2; exit 3',
            ],
            deadlineMs: 5000,
            maxOutputBytes: 1024,
        })).resolves.toEqual({
            exitCode: 3,
            signal: null,
            stdout: 'out',
            stderr: 'err',
            outputTruncated: false,
            deadlineExceeded: false,
        });
    });

    it('keeps at most maxOutputBytes of each stream', async () => {
        const result = await runCommand({
            argv: [
                '/bin/sh',
                '-c',
                'printf 0123456789; printf abcdefghij >&2',
            ],
            deadlineMs: 5000,
            maxOutputBytes: 4,
        });

        expect(result.stdout).toBe('0123');
        expect(result.stderr).toBe('abcd');
        expect(result.outputTruncated).toBe(true);
    });

    it('kills the process at the deadline', async () => {
        const result = await runCommand({
            argv: [
                '/bin/sh',
                '-c',
                'exec sleep 10',
            ],
            deadlineMs: 50,
            maxOutputBytes: 1024,
        });

        expect(result.deadlineExceeded).toBe(true);
        expect(result.signal).toBe('SIGKILL');
        expect(result.exitCode).toBeNull();
    });

    it('ends at the deadline even when a descendant keeps the output open', async () => {
        const startedAt = Date.now();
        const result = await runCommand({
            argv: [
                '/bin/sh',
                '-c',
                'sleep 10 & setsid sleep 10 & exec sleep 10',
            ],
            deadlineMs: 100,
            maxOutputBytes: 1024,
        });

        expect(result.deadlineExceeded).toBe(true);
        expect(Date.now() - startedAt).toBeLessThan(3000);
    });

    it('keeps the output within maxOutputBytes after UTF-8 decoding', async () => {
        const result = await runCommand({
            argv: [
                '/bin/sh',
                '-c',
                'printf \'\\377\\377\\377\\377\\377\\377\'',
            ],
            deadlineMs: 5000,
            maxOutputBytes: 6,
        });

        expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(6);
        expect(result.stdout).toBe('\uFFFD\uFFFD');
        expect(result.outputTruncated).toBe(true);
    });

    it('rejects when the program does not exist', async () => {
        await expect(runCommand({
            argv: ['/nonexistent/program'],
            deadlineMs: 5000,
            maxOutputBytes: 1024,
        })).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
