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
// In a terminal, the CLI wraps the link in an OSC 8 hyperlink, so the escape and bell
// characters end it too.
// eslint-disable-next-line no-control-regex
const URL_PATTERN = /https:\/\/[^\s\u0007\u001b]+(?=[\s\u0007\u001b])/;
const MAX_REASON_LENGTH = 200;

function wrapChildProcess(file: string, args: string[]): LoginProcess {
    const child = spawn(file, args, {
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
}

// The CLI needs no terminal: it prints the link, then reads the code from stdin.
export const spawnClaudeLogin: SpawnLoginProcess = () => wrapChildProcess('claude', [
    'auth',
    'login',
]);

// Only names of this form are passed to the shell of `script`.
export const MCP_SERVER_NAME_PATTERN = /^[\w-]+$/;

// `claude mcp login` refuses to run without a terminal, so `script` gives it one. The terminal
// echoes the pasted redirect URL back into the output, and `-e` returns the exit code of the CLI.
export function spawnMcpLogin(serverName: string): LoginProcess {
    if (!MCP_SERVER_NAME_PATTERN.test(serverName)) {
        throw new Error(`Not a valid MCP server name: ${serverName}`);
    }

    return wrapChildProcess('script', [
        '--quiet',
        '--flush',
        '--return',
        '--command',
        `claude mcp login --no-browser ${serverName}`,
        '/dev/null',
    ]);
}

function describeFailure(output: string, code: string, exitCode: number | null): string {
    const lastLine = output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).at(-1) ?? '';
    const withoutCode = lastLine.replaceAll(code, '***').slice(0, MAX_REASON_LENGTH);

    return `exit code ${exitCode ?? 'none'}${withoutCode.length > 0 ? `: ${withoutCode}` : ''}`;
}

// `rejectionPattern` matches what the command prints when it refuses a code and asks for it
// again instead of exiting: the session then ends with that line as the reason.
export function startLogin(
    spawnProcess: SpawnLoginProcess,
    timeouts: LoginTimeouts = DEFAULT_TIMEOUTS,
    rejectionPattern?: RegExp
): LoginSession {
    const loginProcess = spawnProcess();
    let output = '';
    let running = true;
    let urlFound = false;
    let outputAfterCode: string | null = null;
    let resolveRejected: (line: string) => void = () => undefined;

    let resolveUrl: (url: string) => void = () => undefined;
    let rejectUrl: (error: Error) => void = () => undefined;
    const authorizationUrl = new Promise<string>((resolve, reject) => {
        resolveUrl = resolve;
        rejectUrl = reject;
    });

    // The caller awaits it. This only stops a link that nobody waits for from crashing the process.
    authorizationUrl.catch(() => undefined);

    const urlTimer = setTimeout(() => {
        rejectUrl(new Error('the login command did not print a link in time'));
    }, timeouts.urlMs);

    const exited = new Promise<number | null>((resolve) => {
        loginProcess.onExit((exitCode) => {
            running = false;
            clearTimeout(urlTimer);

            if (!urlFound) {
                rejectUrl(new Error(`the login command stopped before it printed a link (exit code ${exitCode ?? 'none'})`));
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

        if (outputAfterCode !== null && rejectionPattern !== undefined) {
            outputAfterCode += text;
            const rejection = rejectionPattern.exec(outputAfterCode);

            if (rejection !== null) {
                resolveRejected(rejection[0].trim());
            }
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

            const rejected = new Promise<{ rejectedWith: string }>((resolve) => {
                resolveRejected = (line) => resolve({ rejectedWith: line });
            });

            outputAfterCode = '';
            loginProcess.writeLine(code);

            let codeTimer: NodeJS.Timeout | undefined;
            const timedOut = new Promise<'timeout'>((resolve) => {
                codeTimer = setTimeout(() => resolve('timeout'), timeouts.codeMs);
            });
            const result = await Promise.race([
                exited,
                timedOut,
                rejected,
            ]);

            clearTimeout(codeTimer);

            if (typeof result === 'object' && result !== null) {
                loginProcess.kill();

                return {
                    ok: false,
                    reason: result.rejectedWith.replaceAll(code, '***').slice(0, MAX_REASON_LENGTH),
                };
            }

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
