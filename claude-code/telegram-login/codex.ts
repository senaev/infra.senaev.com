import type { CommandRunner } from './claude';
import {
    type LoginProcess, type LoginResult, wrapChildProcess,
} from './login';

// The Codex login of the codex container: its CODEX_HOME is mounted in this container, and the
// `codex` command reads it from the CODEX_HOME env variable.

export type CodexDevicePrompt = {
    url: string;
    code: string;
};

export type CodexDeviceLogin = {
    // The link and the one-time code that the CLI prints first.
    prompt: Promise<CodexDevicePrompt>;
    // Ends when the CLI exits: after the user enters the code, or when the code expires.
    result: Promise<LoginResult>;
    cancel(): void;
};

export type CodexDeviceLoginTimeouts = {
    promptMs: number;
    // The CLI gives up by itself after 15 minutes; this only stops a command that hangs.
    resultMs: number;
};

const DEFAULT_TIMEOUTS: CodexDeviceLoginTimeouts = {
    promptMs: 30_000,
    resultMs: 16 * 60 * 1000,
};

const SUCCESS_TEXT = 'Successfully logged in';
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
// Each value is on its own line, so a line break ends it even when the output comes in pieces.
const URL_PATTERN = /(https:\/\/\S+)\s*\n/;
const CODE_PATTERN = /one-time code[^\n]*\n\s*([A-Z0-9]{4,}-[A-Z0-9]{4,})\s*\n/;
const MAX_REASON_LENGTH = 200;

export function spawnCodexDeviceLogin(): LoginProcess {
    return wrapChildProcess('codex', [
        'login',
        '--device-auth',
    ]);
}

// `codex login status` exits with 0 only when a login exists.
export async function isCodexLoggedIn(run: CommandRunner): Promise<boolean> {
    const { exitCode } = await run('codex', [
        'login',
        'status',
    ]);

    return exitCode === 0;
}

// Exits with 0 also when nobody was logged in, so the caller checks the status afterwards.
export async function logoutCodex(run: CommandRunner): Promise<void> {
    const { exitCode, stdout } = await run('codex', ['logout']);

    if (exitCode !== 0) {
        throw new Error(`codex logout failed with exit code ${exitCode}: ${stdout.trim().slice(0, MAX_REASON_LENGTH)}`);
    }
}

function describeFailure(output: string, code: string | undefined, exitCode: number | null): string {
    const lastLine = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).at(-1) ?? '';
    const masked = (code === undefined ? lastLine : lastLine.replaceAll(code, '***')).slice(0, MAX_REASON_LENGTH);

    return `exit code ${exitCode ?? 'none'}${masked.length > 0 ? `: ${masked}` : ''}`;
}

export function startCodexDeviceLogin(
    spawnProcess: () => LoginProcess,
    timeouts: CodexDeviceLoginTimeouts = DEFAULT_TIMEOUTS
): CodexDeviceLogin {
    const loginProcess = spawnProcess();
    let output = '';
    let running = true;
    let prompt: CodexDevicePrompt | undefined;

    let resolvePrompt: (value: CodexDevicePrompt) => void = () => undefined;
    let rejectPrompt: (error: Error) => void = () => undefined;
    const promptPromise = new Promise<CodexDevicePrompt>((resolve, reject) => {
        resolvePrompt = resolve;
        rejectPrompt = reject;
    });

    // The caller awaits it. This only stops a prompt that nobody waits for from crashing the process.
    promptPromise.catch(() => undefined);

    let resolveResult: (result: LoginResult) => void = () => undefined;
    const result = new Promise<LoginResult>((resolve) => {
        resolveResult = resolve;
    });

    function finish(loginResult: LoginResult): void {
        clearTimeout(promptTimer);
        clearTimeout(resultTimer);
        resolveResult(loginResult);
    }

    const promptTimer = setTimeout(() => {
        rejectPrompt(new Error('the login command did not print a link and a code in time'));
    }, timeouts.promptMs);

    const resultTimer = setTimeout(() => {
        if (running) {
            loginProcess.kill();
        }

        finish({
            ok: false,
            reason: 'the login command gave no answer in time',
        });
    }, timeouts.resultMs);

    loginProcess.onOutput((text) => {
        output += text.replace(ANSI_PATTERN, '');

        if (prompt !== undefined) {
            return;
        }

        const url = URL_PATTERN.exec(output)?.[1];
        const code = CODE_PATTERN.exec(output)?.[1];

        if (url !== undefined && code !== undefined) {
            prompt = {
                url,
                code,
            };
            clearTimeout(promptTimer);
            resolvePrompt(prompt);
        }
    });

    loginProcess.onExit((exitCode) => {
        running = false;

        if (prompt === undefined) {
            rejectPrompt(new Error(`the login command stopped before it printed a link and a code (${describeFailure(output, undefined, exitCode)})`));
        }

        // Both: a CLI that prints the text but fails later must not count as a login.
        finish(exitCode === 0 && output.includes(SUCCESS_TEXT)
            ? { ok: true }
            : {
                ok: false,
                reason: describeFailure(output, prompt?.code, exitCode),
            });
    });

    return {
        prompt: promptPromise,
        result,
        cancel() {
            if (running) {
                loginProcess.kill();
            }
        },
    };
}
