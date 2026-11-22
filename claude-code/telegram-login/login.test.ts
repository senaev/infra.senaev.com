import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { startLogin, type LoginProcess } from './login';

const LINK = 'https://claude.com/cai/oauth/authorize?code=true&state=abc';
const TIMEOUTS = {
    urlMs: 1000,
    codeMs: 2000,
};

function createFakeProcess() {
    let outputListener: (text: string) => void = () => undefined;
    let exitListener: (exitCode: number | null) => void = () => undefined;
    const written: string[] = [];
    let killed = false;
    const loginProcess: LoginProcess = {
        onOutput: (listener) => {
            outputListener = listener;
        },
        onExit: (listener) => {
            exitListener = listener;
        },
        writeLine: (text) => {
            written.push(text);
        },
        kill: () => {
            killed = true;
        },
    };

    return {
        loginProcess,
        written,
        output: (text: string) => outputListener(text),
        exit: (exitCode: number | null) => exitListener(exitCode),
        wasKilled: () => killed,
    };
}

describe('startLogin', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('gives the link from the output, also when it comes in two chunks', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output('Opening browser to sign in…\nIf the browser did not open, visit: https://claude.com/cai/oauth/auth');
        fake.output('orize?code=true&state=abc\nPaste code here if prompted > ');

        await expect(session.authorizationUrl).resolves.toBe(LINK);
    });

    it('fails when the command stops before it prints a link', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);

        fake.exit(1);

        await expect(session.authorizationUrl).rejects.toThrow('exit code 1');
    });

    it('fails when no link comes in time', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);
        const rejection = expect(session.authorizationUrl).rejects.toThrow('in time');

        await vi.advanceTimersByTimeAsync(TIMEOUTS.urlMs);

        await rejection;
    });

    it('writes the code to the command and succeeds when it exits with 0', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(`${LINK}\n`);
        const result = session.submitCode('the-code#state');

        fake.output('Login successful.\n');
        fake.exit(0);

        await expect(result).resolves.toEqual({ ok: true });
        expect(fake.written).toEqual(['the-code#state']);
    });

    it('reports the last output line without the code when the command fails', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(`${LINK}\n`);
        const result = session.submitCode('the-code#state');

        fake.output('Login failed: invalid code the-code#state\n');
        fake.exit(1);

        await expect(result).resolves.toEqual({
            ok: false,
            reason: 'exit code 1: Login failed: invalid code ***',
        });
    });

    it('stops the command when it gives no answer after the code', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(`${LINK}\n`);
        const result = session.submitCode('code');

        await vi.advanceTimersByTimeAsync(TIMEOUTS.codeMs);

        await expect(result).resolves.toMatchObject({ ok: false });
        expect(fake.wasKilled()).toBe(true);
    });

    it('does not take a code after the command stopped', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);

        fake.output(`${LINK}\n`);
        fake.exit(0);

        await expect(session.submitCode('code')).resolves.toMatchObject({ ok: false });
        expect(fake.written).toEqual([]);
    });

    it('gives the link from a terminal hyperlink of claude mcp login', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS);
        const url = 'https://app.datadoghq.eu/oauth2/v1/authorize?client_id=abc&state=xyz';

        fake.output(`Visit this URL to authorize:\n  \u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\\nWaiting for authorization…`);

        await expect(session.authorizationUrl).resolves.toBe(url);
    });

    it('stops the command and reports the line when it refuses the code and asks again', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS, /^.*doesn't look like.*$/m);

        fake.output(`${LINK}\nOr paste the redirect URL here: `);
        const result = session.submitCode('http://localhost:1/callback?code=secret');

        fake.output('http://localhost:1/callback?code=secret\r\nThat doesn\'t look like a redirect URL for this sign-in.\r\nOr paste the redirect URL here: ');

        await expect(result).resolves.toEqual({
            ok: false,
            reason: 'That doesn\'t look like a redirect URL for this sign-in.',
        });
        expect(fake.wasKilled()).toBe(true);
    });

    it('does not take output from before the code as a refusal', async () => {
        const fake = createFakeProcess();
        const session = startLogin(() => fake.loginProcess, TIMEOUTS, /^.*doesn't look like.*$/m);

        fake.output(`${LINK}\nThat doesn't look like a redirect URL\n`);
        const result = session.submitCode('code');

        fake.exit(0);

        await expect(result).resolves.toEqual({ ok: true });
    });

    it('stops a running command when it is cancelled, and no other one', () => {
        const running = createFakeProcess();

        startLogin(() => running.loginProcess, TIMEOUTS).cancel();

        const stopped = createFakeProcess();
        const stoppedSession = startLogin(() => stopped.loginProcess, TIMEOUTS);

        stopped.output(`${LINK}\n`);
        stopped.exit(0);
        stoppedSession.cancel();

        expect(running.wasKilled()).toBe(true);
        expect(stopped.wasKilled()).toBe(false);
    });
});
