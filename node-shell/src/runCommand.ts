import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

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
 * The text of a stream within `maxBytes` of UTF-8: invalid bytes decode to U+FFFD, which is
 * longer than the byte it replaces, so the limit is applied again after decoding.
 */
function decodeWithin(buffer: OutputBuffer, maxBytes: number): { text: string; truncated: boolean } {
    const text = Buffer.concat(buffer.chunks).toString('utf8');
    const encoded = Buffer.from(text, 'utf8');

    if (encoded.length <= maxBytes) {
        return {
            text,
            truncated: false,
        };
    }

    // StringDecoder holds back an incomplete last character, so the text ends on a whole one.
    return {
        text: new StringDecoder('utf8').write(encoded.subarray(0, maxBytes)),
        truncated: true,
    };
}

/**
 * Spawns `argv` without a shell, collects up to `maxOutputBytes` of each output stream, and
 * kills the process at `deadlineMs`. The deadline is only a backstop for the local process (ssh
 * or nsenter): the systemd unit on the target host enforces the command timeout itself.
 * The process gets its own process group, and the deadline kills the whole group (nsenter forks
 * before it runs ssh or systemd-run), then stops reading the output, so a descendant that still
 * holds the pipes cannot keep the execution open. Rejects only when the process cannot start.
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
            detached: true,
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

            try {
                if (child.pid === undefined) {
                    throw new Error('No pid');
                }

                process.kill(-child.pid, 'SIGKILL');
            } catch {
                child.kill('SIGKILL');
            }

            child.stdout.destroy();
            child.stderr.destroy();
        }, deadlineMs);

        child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });

        child.once('close', (exitCode, signal) => {
            clearTimeout(timer);

            const stdoutText = decodeWithin(stdout, maxOutputBytes);
            const stderrText = decodeWithin(stderr, maxOutputBytes);

            resolve({
                exitCode,
                signal,
                stdout: stdoutText.text,
                stderr: stderrText.text,
                outputTruncated: outputTruncated || stdoutText.truncated || stderrText.truncated,
                deadlineExceeded,
            });
        });
    });
}
