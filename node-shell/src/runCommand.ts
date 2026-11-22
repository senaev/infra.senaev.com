import { spawn } from 'node:child_process';

export type CommandResult = {
    /** `null` when a signal ended the process. */
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    /** Output beyond `maxOutputBytes` of a stream was dropped. */
    outputTruncated: boolean;
    /** node-shell killed the local process at `deadlineMs`. */
    deadlineExceeded: boolean;
};

type OutputBuffer = {
    chunks: Buffer[];
    size: number;
};

/**
 * Spawns `argv` without a shell, collects up to `maxOutputBytes` of each output stream, and
 * kills the process at `deadlineMs`. The deadline is only a backstop for the local process (ssh
 * or nsenter): the systemd unit on the target host enforces the command timeout itself.
 * Rejects only when the process cannot start.
 */
export function runCommand({
    argv, deadlineMs, maxOutputBytes,
}: {
    argv: readonly string[];
    deadlineMs: number;
    maxOutputBytes: number;
}): Promise<CommandResult> {
    const [
        file,
        ...args
    ] = argv;

    if (file === undefined) {
        return Promise.reject(new Error('Empty argv'));
    }

    return new Promise((resolve, reject) => {
        const child = spawn(file, args, {
            stdio: [
                'ignore',
                'pipe',
                'pipe',
            ],
        });
        const stdout: OutputBuffer = {
            chunks: [],
            size: 0,
        };
        const stderr: OutputBuffer = {
            chunks: [],
            size: 0,
        };
        let outputTruncated = false;
        let deadlineExceeded = false;

        const collect = (buffer: OutputBuffer) => (chunk: Buffer) => {
            const room = maxOutputBytes - buffer.size;

            if (chunk.length > room) {
                outputTruncated = true;
            }

            if (room > 0) {
                const kept = chunk.subarray(0, room);

                buffer.chunks.push(kept);
                buffer.size += kept.length;
            }
        };

        child.stdout.on('data', collect(stdout));
        child.stderr.on('data', collect(stderr));

        const timer = setTimeout(() => {
            deadlineExceeded = true;
            child.kill('SIGKILL');
        }, deadlineMs);

        child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.once('close', (exitCode, signal) => {
            clearTimeout(timer);
            resolve({
                exitCode,
                signal,
                stdout: Buffer.concat(stdout.chunks).toString('utf8'),
                stderr: Buffer.concat(stderr.chunks).toString('utf8'),
                outputTruncated,
                deadlineExceeded,
            });
        });
    });
}
