import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { isCodexLoggedIn, startCodexDeviceLogin } from './codex';
import type { LoginProcess } from './login';

const TIMEOUTS = {
    promptMs: 1000,
    resultMs: 5000,
};

// The output of `codex login --device-auth` 0.170.0 through a pipe, with its colors.
const PROMPT_OUTPUT = [
    '',
    'Welcome to Codex [v\u001b[90m0.170.0\u001b[0m]',
    '\u001b[90mOpenAI\'s command-line coding agent\u001b[0m',
    '',
    'Follow these steps to sign in with ChatGPT using device code authorization:',
    '',
    '1. Open this link in your browser and sign in to your account',
    '   \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m',
    '',
    '2. Enter this one-time code \u001b[90m(expires in 15 minutes)\u001b[0m',
    '   \u001b[94mSXSO-F4TZE\u001b[0m',
    '',
    '\u001b[90mContinue only if you started this login in Codex. If a website or another person gave you this code, cancel.\u001b[0m',
    '',
].join('\n');

function createFakeProcess() {
    let outputListener: (text: string) => void = () => undefined;
    let exitListener: (exitCode: number | null) => void = () => undefined;
    let killed = false;
    const loginProcess: LoginProcess = {
        onOutput: (listener) => {
            outputListener = listener;
        },
        onExit: (listener) => {
            exitListener = listener;
        },
        writeLine: () => undefined,
        kill: () => {
            killed = true;
        },
    };

    return {
        loginProcess,
        output: (text: string) => outputListener(text),
        exit: (exitCode: number | null) => exitListener(exitCode),
        wasKilled: () => killed,
    };
}

describe('startCodexDeviceLogin', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('gives the link and the code without colors, also when the output comes in pieces', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);
        const middle = PROMPT_OUTPUT.indexOf('SXSO-F4') + 'SXSO-F4'.length;

        fake.output(PROMPT_OUTPUT.slice(0, middle));
        fake.output(PROMPT_OUTPUT.slice(middle));

        await expect(login.prompt).resolves.toEqual({
            url: 'https://auth.openai.com/codex/device',
            code: 'SXSO-F4TZE',
        });
    });

    it('succeeds when the command prints the success text and exits with 0', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(PROMPT_OUTPUT);
        fake.output('Successfully logged in\n');
        fake.exit(0);

        await expect(login.result).resolves.toEqual({ ok: true });
    });

    it('fails when the command exits with 0 but without the success text', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(PROMPT_OUTPUT);
        fake.exit(0);

        await expect(login.result).resolves.toMatchObject({ ok: false });
    });

    it('fails with the last line of the output when the code expires, without the code', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(PROMPT_OUTPUT);
        fake.output('Error logging in with device code SXSO-F4TZE: device auth timed out after 15 minutes\n');
        fake.exit(1);

        await expect(login.result).resolves.toEqual({
            ok: false,
            reason: 'exit code 1: Error logging in with device code ***: device auth timed out after 15 minutes',
        });
    });

    it('fails the prompt when the command stops before it prints the code', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output('Error: failed to request a device code\n');
        fake.exit(1);

        await expect(login.prompt).rejects.toThrow('exit code 1: Error: failed to request a device code');
        await expect(login.result).resolves.toMatchObject({ ok: false });
    });

    it('fails the prompt when no code comes in time', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);
        const rejection = expect(login.prompt).rejects.toThrow('in time');

        await vi.advanceTimersByTimeAsync(TIMEOUTS.promptMs);

        await rejection;
    });

    it('stops a command that hangs after the code expired', async () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(PROMPT_OUTPUT);
        await vi.advanceTimersByTimeAsync(TIMEOUTS.resultMs);

        await expect(login.result).resolves.toEqual({
            ok: false,
            reason: 'the login command gave no answer in time',
        });
        expect(fake.wasKilled()).toBe(true);
    });

    it('stops the command on cancel', () => {
        const fake = createFakeProcess();
        const login = startCodexDeviceLogin(() => fake.loginProcess, TIMEOUTS);

        login.cancel();

        expect(fake.wasKilled()).toBe(true);
    });
});

describe('isCodexLoggedIn', () => {
    it('is true only when `codex login status` exits with 0', async () => {
        const run = vi.fn()
            .mockResolvedValueOnce({
                stdout: 'Logged in using ChatGPT\n',
                exitCode: 0,
            })
            .mockResolvedValueOnce({
                stdout: 'Not logged in\n',
                exitCode: 1,
            });

        await expect(isCodexLoggedIn(run)).resolves.toBe(true);
        await expect(isCodexLoggedIn(run)).resolves.toBe(false);
        expect(run).toHaveBeenCalledWith('codex', [
            'login',
            'status',
        ]);
    });
});
