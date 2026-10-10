import { spawn } from 'node:child_process';

export type ProcessResult = {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    /** True when a part of stdout or stderr was dropped to stay within `maxOutputChars`. */
    outputTruncated: boolean;
    durationMs: number;
};

export type RunProcessOptions = {
    cwd: string;
    timeoutMs: number;
    /** For stdout and stderr together. */
    maxOutputChars: number;
    /**
     * "end" (default) keeps the end of each stream, where a failing command prints its errors.
     * "start" keeps the start of stdout and stops the process when it is full, for output
     * that is parsed from the top, such as ripgrep's JSON.
     */
    keep?: 'end' | 'start';
    env?: NodeJS.ProcessEnv;
};

/** Keeps the start or the end of a stream while it is read, never more than about `2 * limit`. */
class OutputBuffer {
    private text = '';
    private isTruncated = false;

    public constructor(private readonly limit: number, private readonly keep: 'end' | 'start') {}

    public get length(): number {
        return this.text.length;
    }

    /** Returns false when the buffer keeps the start and is full. */
    public append(chunk: string): boolean {
        if (this.keep === 'start') {
            const room = this.limit - this.text.length;

            this.text += chunk.slice(0, room);
            this.isTruncated ||= chunk.length > room;

            return !this.isTruncated;
        }

        this.text += chunk;

        if (this.text.length > this.limit * 2) {
            this.text = this.text.slice(-this.limit);
            this.isTruncated = true;
        }

        return true;
    }

    public take(limit: number): { text: string; truncated: boolean } {
        if (this.text.length <= limit) {
            return {
                text: this.text,
                truncated: this.isTruncated,
            };
        }

        return {
            text: this.keep === 'start' ? this.text.slice(0, limit) : this.text.slice(-limit),
            truncated: true,
        };
    }
}

/** stderr gets at most half of the budget, stdout gets the rest. */
function splitOutputBudget(stdout: OutputBuffer, stderr: OutputBuffer, maxChars: number) {
    const stderrBudget = Math.min(stderr.length, Math.floor(maxChars / 2));
    const stdoutPart = stdout.take(maxChars - stderrBudget);
    const stderrPart = stderr.take(maxChars - stdoutPart.text.length);

    return {
        stdout: stdoutPart.text,
        stderr: stderrPart.text,
        outputTruncated: stdoutPart.truncated || stderrPart.truncated,
    };
}

/**
 * Runs a program without a shell (pass `bash -c` for one). It runs in its own process group,
 * so a timeout kills everything it started, not only the direct child. stdin is closed, so a
 * prompt for input fails at once instead of hanging until the timeout.
 */
export function runProcess(command: string, args: readonly string[], options: RunProcessOptions): Promise<ProcessResult> {
    const startedAt = performance.now();
    const keep = options.keep ?? 'end';
    const stdout = new OutputBuffer(options.maxOutputChars, keep);
    const stderr = new OutputBuffer(options.maxOutputChars, 'end');

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            stdio: [
                'ignore',
                'pipe',
                'pipe',
            ],
            detached: true,
        });
        let timedOut = false;

        const killGroup = () => {
            if (child.pid !== undefined) {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                } catch {
                    // The group is already gone.
                }
            }
        };

        const timer = setTimeout(() => {
            timedOut = true;
            killGroup();
        }, options.timeoutMs);

        child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
            if (!stdout.append(chunk)) {
                killGroup();
            }
        });
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
            stderr.append(chunk);
        });

        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.on('close', (exitCode, signal) => {
            clearTimeout(timer);
            // A background process left by the command would keep the group alive.
            killGroup();
            resolve({
                exitCode,
                signal,
                ...splitOutputBudget(stdout, stderr, options.maxOutputChars),
                timedOut,
                durationMs: Math.round(performance.now() - startedAt),
            });
        });
    });
}
