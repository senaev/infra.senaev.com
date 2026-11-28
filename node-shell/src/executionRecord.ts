/**
 * - `running`: started and not finished yet.
 * - `completed`: the command ended by itself; `exitCode` is its own.
 * - `failed`: the command could not start, node-shell killed it at its deadline, or node-shell did
 *   not see its end (ssh exited with 255, or a signal ended the wait). In the last case the unit
 *   may still run on the host until `endsBy`; `error` says so.
 * - `interrupted`: node-shell restarted while it ran. The outcome is unknown, and it is never
 *   retried; the unit may still run on the host until `endsBy`.
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
    finishedAt?: string;
    stoppedAt?: string;
    error?: string;
};

export type PublicExecution = Omit<ExecutionRecord, 'requestHash'>;

export function toPublicExecution({ requestHash: _requestHash, ...execution }: ExecutionRecord): PublicExecution {
    return execution;
}
