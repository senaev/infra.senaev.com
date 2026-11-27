/**
 * - `running`: started and not finished yet.
 * - `completed`: the local process (ssh, or systemd-run on the local host) ended by itself;
 *   `exitCode` is the command's, or 255 when ssh itself failed (for example, an unreachable host).
 * - `failed`: the process could not start, or node-shell killed it at its deadline.
 * - `interrupted`: node-shell restarted while it ran. The outcome is unknown, and it is never
 *   retried; the systemd unit on the host still ends at its own timeout.
 * - `stopped`: a `DELETE` stopped it before it ended by itself.
 */
import type { CommandResult } from './runCommand';

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'interrupted' | 'stopped';

/** The result of the command, once it ended; a deadline shows as `failed` with an `error`. */
type ExecutionOutput = Partial<Omit<CommandResult, 'deadlineExceeded'>>;

export type ExecutionRecord = ExecutionOutput & {
    executionId: string;
    host: string;
    /** SHA-256 of the request, to tell a repeated request from a different one with the same ID. */
    requestHash: string;
    status: ExecutionStatus;
    startedAt: string;
    /** The latest time the command can still run on its host. */
    endsBy: string;
    /** node-shell did not see the command end, so its unit may run until `endsBy`. */
    mayStillRun?: true;
    finishedAt?: string;
    stoppedAt?: string;
    error?: string;
};

export type PublicExecution = Omit<ExecutionRecord, 'requestHash'>;

export function toPublicExecution({ requestHash: _requestHash, ...execution }: ExecutionRecord): PublicExecution {
    return execution;
}
