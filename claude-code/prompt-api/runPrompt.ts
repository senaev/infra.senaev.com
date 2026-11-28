import { spawn } from 'node:child_process';

import { isBoolean } from 'senaev-utils/src/types/Boolean';
import { isString } from 'senaev-utils/src/utils/String/isString';
import { isNumber } from 'senaev-utils/src/types/Number/Number';

export type PromptResult = {
    /** The last message of Claude: the answer. */
    result: string;
    isError: boolean;
    durationMs: number;
    numTurns: number;
    costUsd: number | null;
};

export type PromptRunner = (prompt: string) => Promise<PromptResult>;

/** The `--output-format json` line that `claude -p` prints at the end of a run. */
export function parsePromptResult(stdout: string): PromptResult {
    const parsed: unknown = JSON.parse(stdout);

    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('claude -p did not print a JSON object');
    }

    const {
        result, is_error: isError, duration_ms: durationMs, num_turns: numTurns, total_cost_usd: costUsd,
    } = parsed as Record<string, unknown>;

    if (!isBoolean(isError)) {
        throw new Error('claude -p did not print the is_error field');
    }

    return {
        // A run that fails before the answer, for example on the turn limit, has no result.
        result: isString(result) ? result : '',
        isError,
        durationMs: isNumber(durationMs) ? durationMs : 0,
        numTurns: isNumber(numTurns) ? numTurns : 0,
        costUsd: isNumber(costUsd) ? costUsd : null,
    };
}

export type SpawnedClaude = {
    writeStdin: (text: string) => void;
    /** Called once the process has exited and its output is read. */
    onClose: (listener: (stdout: string, stderr: string) => void) => void;
    /** Called when the process could not start. */
    onError: (listener: (error: Error) => void) => void;
    kill: () => void;
};

export type ClaudeSpawner = (args: string[]) => SpawnedClaude;

// After SIGTERM, the time the CLI has to stop before SIGKILL.
const KILL_GRACE_MS = 10_000;

export const spawnClaude: ClaudeSpawner = (args) => {
    const child = spawn('claude', args, {
        stdio: [
            'pipe',
            'pipe',
            'pipe',
        ],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
    });

    // The CLI may exit before it reads the whole prompt; writing then fails with EPIPE. The close
    // event reports that run, so this error only must not crash the server.
    child.stdin.on('error', () => {});

    return {
        writeStdin: (text) => child.stdin.end(text),
        onClose: (listener) => child.on('close', () => listener(stdout, stderr)),
        onError: (listener) => child.on('error', listener),
        kill: () => {
            child.kill('SIGTERM');
            setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) {
                    child.kill('SIGKILL');
                }
            }, KILL_GRACE_MS).unref();
        },
    };
};

/**
 * Runs one prompt with `claude -p`, without approvals (the container is the sandbox), and
 * returns the final answer. The prompt goes through stdin, so its length is not limited by
 * the command line.
 */
export function createPromptRunner({
    spawnClaude: spawnProcess,
    model,
    timeoutMs,
}: {
    spawnClaude: ClaudeSpawner;
    model: string;
    timeoutMs: number;
}): PromptRunner {
    return (prompt) => new Promise((resolve, reject) => {
        const child = spawnProcess([
            '--print',
            '--output-format',
            'json',
            '--permission-mode',
            'bypassPermissions',
            '--model',
            model,
        ]);
        let settled = false;
        // Settles the request once: the timeout does not wait for the process to close.
        const settle = (finish: () => void) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                finish();
            }
        };
        const timer = setTimeout(() => {
            settle(() => reject(new Error(`claude -p did not finish in ${timeoutMs} ms`)));
            child.kill();
        }, timeoutMs);

        child.onError((error) => settle(() => reject(error)));
        child.onClose((stdout, stderr) => settle(() => {
            try {
                resolve(parsePromptResult(stdout));
            } catch {
                // Only the end of stderr: it says why the CLI stopped, and it holds no prompt text.
                reject(new Error(`claude -p printed no result: ${stderr.trim().slice(-500)}`));
            }
        }));
        child.writeStdin(prompt);
    });
}
