import { execFile } from 'node:child_process';

export type AuthStatus = {
    loggedIn: boolean;
    loginExpiresAt: Date | null;
};

export type CommandResult = {
    stdout: string;
    exitCode: number;
};

export type CommandRunner = (file: string, args: string[]) => Promise<CommandResult>;

const COMMAND_TIMEOUT_MS = 30_000;

export const runCommand: CommandRunner = (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: COMMAND_TIMEOUT_MS }, (error, stdout) => {
        // A number is the exit code of a command that ran. Anything else, such as ENOENT or a timeout, is a failure to run it.
        if (error !== null && typeof error.code !== 'number') {
            reject(error);

            return;
        }

        resolve({
            stdout,
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

    if (typeof loggedIn !== 'boolean') {
        throw new Error('claude auth status did not print the loggedIn field');
    }

    const expiresAt = typeof loginExpiresAt === 'string' ? new Date(loginExpiresAt) : null;

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
