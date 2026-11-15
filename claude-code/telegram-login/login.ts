import { spawn } from 'node:child_process';

export type LoginProcess = {
    onOutput(listener: (text: string) => void): void;
    onExit(listener: (exitCode: number | null) => void): void;
    writeLine(text: string): void;
    kill(): void;
};

export type SpawnLoginProcess = () => LoginProcess;

export type LoginResult = { ok: true } | {
    ok: false;
    reason: string;
};

export type LoginSession = {
    authorizationUrl: Promise<string>;
    submitCode(code: string): Promise<LoginResult>;
    cancel(): void;
};

export type LoginTimeouts = {
    urlMs: number;
    codeMs: number;
};

const DEFAULT_TIMEOUTS: LoginTimeouts = {
    urlMs: 20_000,
    codeMs: 60_000,
};

// The link is complete only when a white space follows it: the output can arrive in pieces.
const URL_PATTERN = /https:\/\/\S+(?=\s)/;
const MAX_REASON_LENGTH = 200;

export const spawnClaudeLogin: SpawnLoginProcess = () => {
    // The CLI needs no terminal: it prints the link, then reads the code from stdin.
    const child = spawn('claude', [
        'auth',
        'login',
    ], {
        stdio: [
            'pipe',
            'pipe',
            'pipe',
        ],
    });

    // Without a listener, a failed spawn would crash the process.
    child.on('error', () => undefined);
    child.stdin.on('error', () => undefined);

    return {
        onOutput: (listener) => {
            child.stdout.on('data', (chunk: Buffer) => listener(chunk.toString()));
            child.stderr.on('data', (chunk: Buffer) => listener(chunk.toString()));
        },
        onExit: (listener) => {
            child.on('close', (exitCode) => listener(exitCode));
            child.on('error', () => listener(null));
        },
        writeLine: (text) => {
            child.stdin.write(`${text}\n`);
        },
        kill: () => {
            child.kill();
        },
    };
};

function describeFailure(output: string, code: string, exitCode: number | null): string {
    const lastLine = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).at(-1) ?? '';
    const withoutCode = lastLine.replaceAll(code, '***').slice(0, MAX_REASON_LENGTH);

    return `exit code ${exitCode ?? 'none'}${withoutCode.length > 0 ? `: ${withoutCode}` : ''}`;
}

export function startLogin(spawnProcess: SpawnLoginProcess, timeouts: LoginTimeouts = DEFAULT_TIMEOUTS): LoginSession {
    const loginProcess = spawnProcess();
    let output = '';
    let running = true;
    let urlFound = false;

    let resolveUrl: (url: string) => void = () => undefined;
    let rejectUrl: (error: Error) => void = () => undefined;
    const authorizationUrl = new Promise<string>((resolve, reject) => {
        resolveUrl = resolve;
        rejectUrl = reject;
    });

    // The caller awaits it. This only stops a link that nobody waits for from crashing the process.
    authorizationUrl.catch(() => undefined);

    const urlTimer = setTimeout(() => {
        rejectUrl(new Error('claude auth login did not print a link in time'));
    }, timeouts.urlMs);

    const exited = new Promise<number | null>((resolve) => {
        loginProcess.onExit((exitCode) => {
            running = false;
            clearTimeout(urlTimer);

            if (!urlFound) {
                rejectUrl(new Error(`claude auth login stopped before it printed a link (exit code ${exitCode ?? 'none'})`));
            }

            resolve(exitCode);
        });
    });

    loginProcess.onOutput((text) => {
        output += text;
        const match = urlFound ? null : URL_PATTERN.exec(output);

        if (match !== null) {
            urlFound = true;
            clearTimeout(urlTimer);
            resolveUrl(match[0]);
        }
    });

    return {
        authorizationUrl,
        async submitCode(code) {
            if (!running) {
                return {
                    ok: false,
                    reason: 'the login command is not running any more',
                };
            }

            loginProcess.writeLine(code);

            let codeTimer: NodeJS.Timeout | undefined;
            const timedOut = new Promise<'timeout'>((resolve) => {
                codeTimer = setTimeout(() => resolve('timeout'), timeouts.codeMs);
            });
            const result = await Promise.race([
                exited,
                timedOut,
            ]);

            clearTimeout(codeTimer);

            if (result === 'timeout') {
                loginProcess.kill();

                return {
                    ok: false,
                    reason: 'the login command gave no answer in time',
                };
            }

            return result === 0
                ? { ok: true }
                : {
                    ok: false,
                    reason: describeFailure(output, code, result),
                };
        },
        cancel() {
            clearTimeout(urlTimer);

            if (running) {
                loginProcess.kill();
            }
        },
    };
}
