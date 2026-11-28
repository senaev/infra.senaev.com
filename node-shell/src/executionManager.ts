import { createHash } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { wrapError } from 'senaev-utils/src/utils/Error/wrapError';

import {
    buildNodeCommand, buildStopCommand, type NodeCommand, UNIT_STOP_TIMEOUT_SECONDS,
} from './buildNodeCommand';
import type { ExecutionRecord } from './executionRecord';
import { type HostTarget, resolveHost } from './nodeHosts';
import { runCommand } from './runCommand';

export const MAX_TIMEOUT_SECONDS = 3600;
export const MAX_CONCURRENT_EXECUTIONS = 1;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
// Unit stop + margin (also for the ssh connection), so the client outlives the unit.
const DEADLINE_GRACE_MS = (UNIT_STOP_TIMEOUT_SECONDS + 55) * 1000;
const STOP_DEADLINE_MS = (UNIT_STOP_TIMEOUT_SECONDS + 25) * 1000;
// `systemctl stop` of a unit that is already gone: the command has ended by itself.
const UNIT_NOT_LOADED_EXIT_CODE = 5;

export type StartResult =
    | { kind: 'started'; record: ExecutionRecord }
    | { kind: 'existing'; record: ExecutionRecord }
    | { kind: 'conflict' }
    | { kind: 'unknown-host' }
    | { kind: 'hosts-unavailable' }
    | { kind: 'busy' };

export type StopResult =
    | { kind: 'stopped'; record: ExecutionRecord }
    | { kind: 'not-running'; record: ExecutionRecord }
    | { kind: 'not-found' }
    | { kind: 'stop-failed' };

function hashRequest({
    host, command, timeoutSeconds,
}: NodeCommand): string {
    return createHash('sha256').update(JSON.stringify([
        host,
        command,
        timeoutSeconds,
    ])).digest('hex');
}

function existingResult(record: ExecutionRecord, requestHash: string): StartResult {
    return record.requestHash === requestHash
        ? {
            kind: 'existing',
            record,
        }
        : { kind: 'conflict' };
}

export class ExecutionManager {
    // In memory only: after a restart node-shell forgets every command, also one that still runs.
    private readonly records = new Map<string, ExecutionRecord>();
    private readonly logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
    // Taken before any await, so concurrent starts cannot all pass the check.
    private reservedSlots = 0;
    // The commands of this process that run now, and the last stop of each: when it was asked for,
    // and whether it was confirmed. Only a confirmed stop makes the result `stopped`.
    private readonly active = new Map<string, HostTarget>();
    private readonly stops = new Map<string, { requestedAt: string; confirmed: Promise<boolean> }>();

    public constructor({ logger }: { logger: Pick<FastifyBaseLogger, 'info' | 'error'> }) {
        this.logger = logger;
    }

    /** Starts the command once per execution ID and returns at once. */
    public async start(nodeCommand: NodeCommand): Promise<StartResult> {
        const requestHash = hashRequest(nodeCommand);
        // Before the host: a repeated request needs no node list.
        const existing = this.records.get(nodeCommand.executionId);

        if (existing !== undefined) {
            return existingResult(existing, requestHash);
        }

        let target: HostTarget | undefined;

        try {
            target = await resolveHost(nodeCommand.host);
        } catch (error) {
            this.logger.error({ err: wrapError(error) }, '❌ Failed to read the cluster nodes');

            return { kind: 'hosts-unavailable' };
        }

        if (target === undefined) {
            return { kind: 'unknown-host' };
        }

        // Again after the await: another start of the same ID may have come meanwhile.
        const raced = this.records.get(nodeCommand.executionId);

        if (raced !== undefined) {
            return existingResult(raced, requestHash);
        }

        if (this.reservedSlots >= MAX_CONCURRENT_EXECUTIONS) {
            return { kind: 'busy' };
        }

        this.reservedSlots += 1;

        const startedAt = new Date();
        const record: ExecutionRecord = {
            executionId: nodeCommand.executionId,
            host: nodeCommand.host,
            requestHash,
            status: 'running',
            startedAt: startedAt.toISOString(),
            endsBy: new Date(startedAt.getTime() + nodeCommand.timeoutSeconds * 1000 + DEADLINE_GRACE_MS).toISOString(),
        };

        this.records.set(record.executionId, record);
        this.active.set(record.executionId, target);

        const release = () => {
            this.reservedSlots -= 1;
            this.active.delete(record.executionId);
            this.stops.delete(record.executionId);
        };

        this.logger.info({
            executionId: record.executionId,
            host: record.host,
            timeoutSeconds: nodeCommand.timeoutSeconds,
        }, '▶️ Node command started');

        void this.execute(nodeCommand, target, record)
            .catch((error: unknown) => {
                this.logger.error({
                    err: wrapError(error),
                    executionId: record.executionId,
                }, '❌ A node command failed unexpectedly');
            })
            .finally(release);

        return {
            kind: 'started',
            record,
        };
    }

    public get(executionId: string): ExecutionRecord | undefined {
        return this.records.get(executionId);
    }

    /** Forgets the finished commands that ended more than `maxAgeMs` ago; returns how many. */
    public removeFinishedOlderThan(maxAgeMs: number, now: Date): number {
        let removed = 0;

        for (const [
            executionId,
            { finishedAt },
        ] of this.records) {
            if (finishedAt !== undefined && now.getTime() - Date.parse(finishedAt) > maxAgeMs) {
                this.records.delete(executionId);
                removed += 1;
            }
        }

        return removed;
    }

    /** Stops the systemd unit of a command that this process runs; returns when it has stopped. */
    public async stop(executionId: string): Promise<StopResult> {
        const record = this.records.get(executionId);

        if (record === undefined) {
            return { kind: 'not-found' };
        }

        // Only while the record is `running`: a finished one is no longer the active command's.
        const target = record.status === 'running' ? this.active.get(executionId) : undefined;

        if (target === undefined) {
            return {
                kind: 'not-running',
                record,
            };
        }

        // A repeated stop waits for the last one, and tries again only when that one failed.
        const previous = this.stops.get(executionId);

        if (previous !== undefined) {
            if (await previous.confirmed) {
                return {
                    kind: 'stopped',
                    record: this.records.get(executionId) ?? record,
                };
            }

            if (this.stops.get(executionId) === previous) {
                this.stops.delete(executionId);
            }

            return this.stop(executionId);
        }

        const confirmed = this.runStop(target, record);

        this.stops.set(executionId, {
            requestedAt: new Date().toISOString(),
            confirmed,
        });

        if (!await confirmed) {
            return { kind: 'stop-failed' };
        }

        return {
            kind: 'stopped',
            record: this.records.get(executionId) ?? record,
        };
    }

    private async runStop(target: HostTarget, record: ExecutionRecord): Promise<boolean> {
        const logFields = {
            executionId: record.executionId,
            host: record.host,
        };

        this.logger.info(logFields, '⏹️ Stopping a node command');

        try {
            const { exitCode } = await runCommand({
                argv: buildStopCommand(target, record.executionId),
                deadlineMs: STOP_DEADLINE_MS,
                maxOutputBytes: MAX_OUTPUT_BYTES,
            });

            if (exitCode === 0 || exitCode === UNIT_NOT_LOADED_EXIT_CODE) {
                return true;
            }

            this.logger.error({
                ...logFields,
                exitCode,
            }, '❌ Failed to stop a node command');
        } catch (error) {
            this.logger.error({
                ...logFields,
                err: wrapError(error),
            }, '❌ Failed to stop a node command');
        }

        return false;
    }

    private async execute(nodeCommand: NodeCommand, target: HostTarget, record: ExecutionRecord): Promise<void> {
        const logFields = {
            executionId: record.executionId,
            host: record.host,
        };
        let finished: ExecutionRecord;

        try {
            const { deadlineExceeded, ...output } = await runCommand({
                argv: buildNodeCommand(target, nodeCommand),
                deadlineMs: nodeCommand.timeoutSeconds * 1000 + DEADLINE_GRACE_MS,
                maxOutputBytes: MAX_OUTPUT_BYTES,
            });
            const stop = this.stops.get(record.executionId);
            const stoppedAt = stop !== undefined && await stop.confirmed ? stop.requestedAt : undefined;
            const error = failureOf(target, output, deadlineExceeded, record.endsBy);
            let status: ExecutionRecord['status'] = error === undefined ? 'completed' : 'failed';

            if (stoppedAt !== undefined) {
                status = 'stopped';
            }

            finished = {
                ...record,
                ...output,
                status,
                ...stoppedAt === undefined ? {} : { stoppedAt },
                ...stoppedAt === undefined && error !== undefined ? { error } : {},
                finishedAt: new Date().toISOString(),
            };
        } catch (error) {
            finished = {
                ...record,
                status: 'failed',
                finishedAt: new Date().toISOString(),
                error: stringifyUnknownError(error),
            };
        }

        this.records.set(finished.executionId, finished);

        // No command and no output in the logs: they can hold secrets.
        this.logger.info({
            ...logFields,
            status: finished.status,
            exitCode: finished.exitCode,
        }, '🏁 Node command finished');
    }
}

// Why a command that was not stopped failed. A dropped ssh or a signal to the waiter hides the
// end of the command, which may then still run on its host.
function failureOf(
    target: HostTarget,
    { exitCode }: { exitCode: number | null },
    deadlineExceeded: boolean,
    endsBy: string
): string | undefined {
    if (deadlineExceeded) {
        return 'node-shell killed the command at its deadline';
    }

    if (exitCode === null) {
        return `A signal ended the wait for the command; it may still run on the host until ${endsBy}`;
    }

    if (target.kind === 'ssh' && exitCode === 255) {
        return `ssh exited with 255: the connection failed, or the command exited with 255; it may still run on the host until ${endsBy}`;
    }

    return undefined;
}
