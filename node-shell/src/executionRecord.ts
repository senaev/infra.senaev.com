/**
 * - `running`: started and not finished yet.
 * - `completed`: the local process (ssh, or systemd-run on the local host) ended by itself;
 *   `exitCode` is the command's, or 255 when ssh itself failed (for example, an unreachable host).
 * - `failed`: the process could not start, or node-shell killed it at its deadline.
 * - `interrupted`: node-shell restarted while it ran. The outcome is unknown, and it is never
 *   retried; the systemd unit on the host still ends at its own timeout.
 */
export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'interrupted';

export type ExecutionRecord = {
    executionId: string;
    host: string;
    /** SHA-256 of the request, to tell a repeated request from a different one with the same ID. */
    requestHash: string;
    status: ExecutionStatus;
    startedAt: string;
    /**
     * The latest time the command can still run on its host: its timeout, plus the stop of the
     * systemd unit and the SSH connection. After a restart, no new command starts before it.
     */
    endsBy: string;
    finishedAt?: string;
    exitCode?: number | null;
    signal?: string | null;
    stdout?: string;
    stderr?: string;
    outputTruncated?: boolean;
    error?: string;
};

/** What the API returns: everything except the internal request hash. */
export type PublicExecution = Omit<ExecutionRecord, 'requestHash'>;

export function toPublicExecution({ requestHash: _requestHash, ...execution }: ExecutionRecord): PublicExecution {
    return execution;
}
