import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
    ClaudeSpawner, createPromptRunner, parsePromptResult,
} from './runPrompt';

describe('parsePromptResult', () => {
    it('reads the answer and the run details', () => {
        expect(parsePromptResult('{"type":"result","subtype":"success","is_error":false,"duration_ms":5100,"num_turns":3,"result":"☀️ Sunny","total_cost_usd":0.04}')).toEqual({
            result: '☀️ Sunny',
            isError: false,
            durationMs: 5100,
            numTurns: 3,
            costUsd: 0.04,
        });
    });

    it('accepts a failed run without a result', () => {
        expect(parsePromptResult('{"subtype":"error_max_turns","is_error":true}')).toEqual({
            result: '',
            isError: true,
            durationMs: 0,
            numTurns: 0,
            costUsd: null,
        });
    });

    it('rejects output that is not a result', () => {
        expect(() => parsePromptResult('Error: not logged in')).toThrow();
        expect(() => parsePromptResult('{"result":"x"}')).toThrow('is_error');
    });
});

function createFakeClaude() {
    const fake = {
        args: [] as string[],
        stdin: '',
        killed: false,
        close: (_stdout: string, _stderr: string) => {},
        fail: (_error: Error) => {},
    };
    const spawn: ClaudeSpawner = (args) => {
        fake.args = args;

        return {
            writeStdin: (text) => {
                fake.stdin = text;
            },
            onClose: (listener) => {
                fake.close = listener;
            },
            onError: (listener) => {
                fake.fail = listener;
            },
            kill: () => {
                fake.killed = true;
            },
        };
    };

    return {
        fake,
        spawn,
    };
}

describe('createPromptRunner', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs claude -p without approvals and passes the prompt through stdin', async () => {
        const { fake, spawn } = createFakeClaude();
        const run = createPromptRunner({
            spawnClaude: spawn,
            model: 'sonnet',
            timeoutMs: 1000,
        })('Weather in Madrid?');

        fake.close('{"is_error":false,"result":"🌧️ Rain"}', '');

        await expect(run).resolves.toMatchObject({ result: '🌧️ Rain' });
        expect(fake.args).toEqual([
            '--print',
            '--output-format',
            'json',
            '--permission-mode',
            'bypassPermissions',
            '--model',
            'sonnet',
        ]);
        expect(fake.stdin).toBe('Weather in Madrid?');
    });

    it('reports the end of stderr when there is no result', async () => {
        const { fake, spawn } = createFakeClaude();
        const run = createPromptRunner({
            spawnClaude: spawn,
            model: 'sonnet',
            timeoutMs: 1000,
        })('x');

        fake.close('', 'Invalid API key · Please run /login\n');

        await expect(run).rejects.toThrow('claude -p printed no result: Invalid API key · Please run /login');
    });

    it('stops a run that takes too long', async () => {
        const { fake, spawn } = createFakeClaude();
        const run = createPromptRunner({
            spawnClaude: spawn,
            model: 'sonnet',
            timeoutMs: 1000,
        })('x');
        const assertion = expect(run).rejects.toThrow('did not finish in 1000 ms');

        // The process does not close after the kill: the request fails anyway.
        await vi.advanceTimersByTimeAsync(1000);

        await assertion;
        expect(fake.killed).toBe(true);
        fake.close('{"is_error":false,"result":"late"}', '');
    });

    it('fails when the CLI cannot start', async () => {
        const { fake, spawn } = createFakeClaude();
        const run = createPromptRunner({
            spawnClaude: spawn,
            model: 'sonnet',
            timeoutMs: 1000,
        })('x');

        fake.fail(new Error('spawn claude ENOENT'));

        await expect(run).rejects.toThrow('ENOENT');
    });
});
