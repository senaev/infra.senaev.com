import {
    escapeTelegramMarkdown, telegramCode, telegramLink,
} from 'senaev-utils/src/utils/TelegramApi/formatTelegramMarkdown/formatTelegramMarkdown';
import {
    describe, expect, it, vi,
} from 'vitest';

import type { CodexDeviceLogin, CodexDevicePrompt } from './codex';
import { createCodexLogin } from './codexLogin';
import type { LoginResult } from './login';

vi.mock('./logger', () => {
    return {
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

const PROMPT: CodexDevicePrompt = {
    url: 'https://auth.openai.com/codex/device',
    code: 'SXSO-F4TZE',
};

function linkMessage(intro: string): string {
    return [
        escapeTelegramMarkdown(intro),
        escapeTelegramMarkdown('Open the link, sign in to ChatGPT, and enter this code. It expires in 15 minutes.'),
        telegramLink({
            text: 'Log in to Codex',
            url: PROMPT.url,
        }),
        telegramCode(PROMPT.code),
    ].join('\n\n');
}

// A device login whose result the test ends by hand.
function createDeviceLogin(prompt: Promise<CodexDevicePrompt> = Promise.resolve(PROMPT)) {
    let finish: (result: LoginResult) => void = () => undefined;
    const result = new Promise<LoginResult>((resolve) => {
        finish = resolve;
    });
    const login: CodexDeviceLogin = {
        prompt,
        result,
        cancel: vi.fn(),
    };

    return {
        login,
        finish,
    };
}

function setup(initiallyLoggedIn: boolean) {
    let loggedIn = initiallyLoggedIn;
    const logins: ReturnType<typeof createDeviceLogin>[] = [];
    const sent: string[] = [];
    const codexLogin = createCodexLogin({
        isLoggedIn: () => Promise.resolve(loggedIn),
        startLogin: () => {
            const deviceLogin = createDeviceLogin();

            logins.push(deviceLogin);

            return deviceLogin.login;
        },
        sendMarkdown: (markdown) => {
            sent.push(markdown);

            return Promise.resolve();
        },
    });

    return {
        codexLogin,
        logins,
        sent,
        setLoggedIn: (value: boolean) => {
            loggedIn = value;
        },
    };
}

// Lets the result of the login reach the report.
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

describe('createCodexLogin', () => {
    it('sends the link and the code on /codex_auth, and confirms the login when the command succeeds', async () => {
        const {
            codexLogin, logins, sent, setLoggedIn,
        } = setup(false);

        await codexLogin.handleAuthCommand();

        expect(sent).toEqual([linkMessage('🔑 Codex login')]);

        setLoggedIn(true);
        logins[0]?.finish({ ok: true });
        await settle();

        expect(sent.at(-1)).toBe(escapeTelegramMarkdown('✅ Codex is logged in.'));
    });

    it('reports a failed login with its reason', async () => {
        const {
            codexLogin, logins, sent,
        } = setup(false);

        await codexLogin.handleAuthCommand();
        logins[0]?.finish({
            ok: false,
            reason: 'exit code 1: device auth timed out after 15 minutes',
        });
        await settle();

        expect(sent.at(-1)).toBe(escapeTelegramMarkdown('❌ The Codex login failed: exit code 1: device auth timed out after 15 minutes\n\nSend /codex_auth to try again.'));
    });

    it('does not confirm a login that the status does not show', async () => {
        const {
            codexLogin, logins, sent,
        } = setup(false);

        await codexLogin.handleAuthCommand();
        logins[0]?.finish({ ok: true });
        await settle();

        expect(sent.at(-1)).toContain('still not logged in');
    });

    it('stops the running login on a new /codex_auth, and reports only the new one', async () => {
        const {
            codexLogin, logins, sent, setLoggedIn,
        } = setup(false);

        await codexLogin.handleAuthCommand();
        await codexLogin.handleAuthCommand();

        expect(logins[0]?.login.cancel).toHaveBeenCalled();

        logins[0]?.finish({
            ok: false,
            reason: 'killed',
        });
        setLoggedIn(true);
        logins[1]?.finish({ ok: true });
        await settle();

        expect(sent).toEqual([
            linkMessage('🔑 Codex login'),
            linkMessage('🔑 Codex login'),
            escapeTelegramMarkdown('✅ Codex is logged in.'),
        ]);
    });

    it('says when the login cannot start', async () => {
        const sent: string[] = [];
        const codexLogin = createCodexLogin({
            isLoggedIn: () => Promise.resolve(false),
            startLogin: () => createDeviceLogin(Promise.reject(new Error('the login command did not print a link and a code in time'))).login,
            sendMarkdown: (markdown) => {
                sent.push(markdown);

                return Promise.resolve();
            },
        });

        await codexLogin.handleAuthCommand();

        expect(sent).toEqual([escapeTelegramMarkdown('Could not start the Codex login: the login command did not print a link and a code in time')]);
    });

    it('starts a login by itself once when Codex is logged out, and again only after a login', async () => {
        const {
            codexLogin, logins, sent, setLoggedIn,
        } = setup(false);

        await codexLogin.checkLogin();

        expect(sent).toEqual([linkMessage('🔑 Codex is logged out.')]);

        // The code expires: no new login until the user asks or the login comes back and is lost again.
        logins[0]?.finish({
            ok: false,
            reason: 'expired',
        });
        await settle();
        await codexLogin.checkLogin();

        expect(logins).toHaveLength(1);

        setLoggedIn(true);
        await codexLogin.checkLogin();
        setLoggedIn(false);
        await codexLogin.checkLogin();

        expect(logins).toHaveLength(2);
    });

    it('sends nothing while Codex is logged in', async () => {
        const {
            codexLogin, logins, sent,
        } = setup(true);

        await codexLogin.checkLogin();

        expect(logins).toHaveLength(0);
        expect(sent).toEqual([]);
    });

    it('does not start a second login while one waits for the user', async () => {
        const { codexLogin, logins } = setup(false);

        await codexLogin.handleAuthCommand();
        await codexLogin.checkLogin();

        expect(logins).toHaveLength(1);
    });

    it('stops the running login on stop, and reports nothing', async () => {
        const {
            codexLogin, logins, sent,
        } = setup(false);

        await codexLogin.handleAuthCommand();
        codexLogin.stop();
        logins[0]?.finish({
            ok: false,
            reason: 'killed',
        });
        await settle();

        expect(logins[0]?.login.cancel).toHaveBeenCalled();
        expect(sent).toHaveLength(1);
    });
});
