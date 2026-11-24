import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import {
    findLastConnectionError, isCodexLoggedIn, startCodexDeviceLogin, startCodexPairing,
} from './codex';
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

describe('startCodexPairing', () => {
    it('gives the manual code and the expiry from the JSON of the command', async () => {
        const run = vi.fn().mockResolvedValue({
            stdout: '{"pairingCode":"qr-payload","manualPairingCode":"ABCD-EFGH","environmentId":"env","expiresAt":1795201800}\n',
            exitCode: 0,
        });

        await expect(startCodexPairing(run)).resolves.toEqual({
            code: 'ABCD-EFGH',
            expiresAt: new Date(1795201800 * 1000),
        });
        expect(run).toHaveBeenCalledWith('codex', [
            'remote-control',
            'pair',
            '--json',
        ]);
    });

    it('fails with the error and its causes on one line', async () => {
        const run = vi.fn().mockResolvedValue({
            stdout: '',
            stderr: 'Error: failed to connect to /home/codex/.codex/app-server-control/app-server-control.sock\n\nCaused by:\n    No such file or directory (os error 2)\n',
            exitCode: 1,
        });

        await expect(startCodexPairing(run)).rejects.toThrow(/^failed to connect to \/home\/codex\/\.codex\/app-server-control\/app-server-control\.sock: No such file or directory \(os error 2\)$/);
    });

    it('fails with the first line of the error of the command', async () => {
        const run = vi.fn().mockResolvedValue({
            stdout: '',
            stderr: 'Error: remoteControl/pairing/start failed: remote control pairing is unavailable until enrollment completes\n',
            exitCode: 1,
        });

        await expect(startCodexPairing(run)).rejects.toThrow(/^remoteControl\/pairing\/start failed: remote control pairing is unavailable until enrollment completes$/);
    });

    it('fails when the JSON has no manual code', async () => {
        const run = vi.fn().mockResolvedValue({
            stdout: '{"pairingCode":"qr-payload","expiresAt":1795201800}',
            exitCode: 0,
        });

        await expect(startCodexPairing(run)).rejects.toThrow('no manual pairing code');
    });
});

describe('findLastConnectionError', () => {
    // Lines of daemon.stderr.log with RUST_LOG at info for the remote control module.
    const failed = (error: string) => `2026-11-20T13:17:31.061051Z \u001b[33m WARN\u001b[0m codex_app_server_transport::transport::remote_control::websocket: failed to connect to app-server remote control websocket websocket_url=wss://chatgpt.com/backend-api/wham/remote/control/server server_name=senaev-codex error=${error} error_kind=Other reconnect_attempt=1`;

    it('gives the error of the last failed connection, without colors', () => {
        const log = [
            failed('remote control requires ChatGPT authentication'),
            '2026-11-20T13:17:31Z  INFO remote control websocket status changed',
            failed('remote control server enrollment failed: HTTP 403 Forbidden, body: {"detail":"Multi-factor authentication required"}; retrying after auth recovery'),
            '',
        ].join('\n');

        expect(findLastConnectionError(log)).toBe('remote control server enrollment failed: HTTP 403 Forbidden, body: {"detail":"Multi-factor authentication required"}; retrying after auth recovery');
    });

    it('gives nothing when a later connection succeeded', () => {
        const log = [
            failed('remote control server enrollment failed: HTTP 403 Forbidden'),
            '2026-11-20T19:44:30.600962Z \u001b[32m INFO\u001b[0m codex_app_server_transport::transport::remote_control::websocket: connected to app-server remote control websocket server_name=senaev-codex',
            '',
        ].join('\n');

        expect(findLastConnectionError(log)).toBeUndefined();
    });

    it('gives nothing when no connection failed', () => {
        expect(findLastConnectionError('2026-11-20T13:17:31Z  INFO connected to app-server remote control websocket\n')).toBeUndefined();
    });
});
