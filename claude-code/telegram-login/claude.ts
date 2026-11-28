import { execFile } from 'node:child_process';

import { isNumber } from 'senaev-utils/src/types/Number/Number';
import { isBoolean } from 'senaev-utils/src/types/Boolean';
import { isString } from 'senaev-utils/src/utils/String/isString';

export type AuthStatus = {
    loggedIn: boolean;
    loginExpiresAt: Date | null;
};

export type CommandResult = {
    stdout: string;
    exitCode: number;
    // Only where the caller reads it, such as the error of `codex remote-control pair`.
    stderr?: string;
};

export type CommandRunner = (file: string, args: string[]) => Promise<CommandResult>;

const COMMAND_TIMEOUT_MS = 30_000;

export const runCommand: CommandRunner = (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: COMMAND_TIMEOUT_MS }, (error, stdout, stderr) => {
        // A number is the exit code of a command that ran. Anything else, such as ENOENT or a timeout, is a failure to run it.
        if (error !== null && !isNumber(error.code)) {
            reject(error);

            return;
        }

        resolve({
            stdout,
            stderr,
            exitCode: error === null ? 0 : Number(error.code),
        });
    });
});

export function parseAuthStatus(stdout: string): AuthStatus {
    const parsed: unknown = JSON.parse(stdout);

    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('claude auth status did not print a JSON object');
    }

    const { loggedIn, loginExpiresAt } = parsed as Record<string, unknown>;

    if (!isBoolean(loggedIn)) {
        throw new Error('claude auth status did not print the loggedIn field');
    }

    const expiresAt = isString(loginExpiresAt) ? new Date(loginExpiresAt) : null;

    return {
        loggedIn,
        loginExpiresAt: expiresAt !== null && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    };
}

// The command exits with 1 when nobody is logged in, and still prints the JSON.
export async function getAuthStatus(run: CommandRunner): Promise<AuthStatus> {
    const { stdout } = await run('claude', [
        'auth',
        'status',
    ]);

    return parseAuthStatus(stdout);
}

// Exits with 0 also when nobody was logged in, so the caller checks the status afterwards.
export async function logoutClaude(run: CommandRunner): Promise<void> {
    const { exitCode, stdout } = await run('claude', [
        'auth',
        'logout',
    ]);

    if (exitCode !== 0) {
        throw new Error(`claude auth logout failed with exit code ${exitCode}: ${stdout.trim().slice(0, 200)}`);
    }
}
