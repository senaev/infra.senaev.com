import { createHash } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { wrapError } from 'senaev-utils/src/utils/Error/wrapError';

import {
    buildNodeCommand, buildStopCommand, type NodeCommand, SSH_CONNECT_TIMEOUT_SECONDS, UNIT_STOP_TIMEOUT_SECONDS,
} from './buildNodeCommand';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionRecords } from './executionRecords';
import { type HostTarget, resolveHost } from './nodeHosts';
import { runCommand } from './runCommand';

export const MAX_TIMEOUT_SECONDS = 3600;
export const MAX_CONCURRENT_EXECUTIONS = 1;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
// ssh connect + unit stop + margin, so the client outlives the unit.
const DEADLINE_GRACE_MS = (SSH_CONNECT_TIMEOUT_SECONDS + UNIT_STOP_TIMEOUT_SECONDS + 45) * 1000;
const STOP_DEADLINE_MS = (SSH_CONNECT_TIMEOUT_SECONDS + UNIT_STOP_TIMEOUT_SECONDS + 15) * 1000;
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

export type ExecutionManager = {
    /** Starts the command once per execution ID and returns at once. */
    start: (nodeCommand: NodeCommand) => Promise<StartResult>;
    get: (executionId: string) => ExecutionRecord | undefined;
    /** Stops the systemd unit of a command that this process runs; returns when it has stopped. */
    stop: (executionId: string) => Promise<StopResult>;
};

function hashRequest({
    host, command, timeoutSeconds,
}: NodeCommand): string {
    return createHash('sha256').update(JSON.stringify([
        host,
        command,
        timeoutSeconds,
    ])).digest('hex');
}

export function createExecutionManager({
    records, logger,
}: {
    records: ExecutionRecords;
    logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
}): ExecutionManager {
    // Taken before any await, so concurrent starts cannot all pass the check.
    let reservedSlots = 0;
    // The commands of this process that run now, and the last stop of each: when it was asked for,
    // and whether it was confirmed. Only a confirmed stop makes the result `stopped`.
    const active = new Map<string, HostTarget>();
    const stops = new Map<string, { requestedAt: string; confirmed: Promise<boolean> }>();

    const runStop = async (target: HostTarget, record: ExecutionRecord): Promise<boolean> => {
        const logFields = {
            executionId: record.executionId,
            host: record.host,
        };

        logger.info(logFields, '⏹️ Stopping a node command');

        try {
            const { exitCode } = await runCommand({
                argv: buildStopCommand(target, record.executionId),
                deadlineMs: STOP_DEADLINE_MS,
                maxOutputBytes: MAX_OUTPUT_BYTES,
            });

            if (exitCode === 0 || exitCode === UNIT_NOT_LOADED_EXIT_CODE) {
                return true;
            }

            logger.error({
                ...logFields,
                exitCode,
            }, '❌ Failed to stop a node command');
        } catch (error) {
            logger.error({
                ...logFields,
                err: wrapError(error),
            }, '❌ Failed to stop a node command');
        }

        return false;
    };

    const existingResult = (record: ExecutionRecord, requestHash: string): StartResult => (record.requestHash === requestHash
        ? {
            kind: 'existing',
            record,
        }
        : { kind: 'conflict' });

    const execute = async (nodeCommand: NodeCommand, target: HostTarget, record: ExecutionRecord): Promise<void> => {
        const logFields = {
            executionId: record.executionId,
            host: record.host,
        };
        let finished: ExecutionRecord;
        const endsByMs = new Date(record.endsBy).getTime();
        // The record is saved before the command starts: the command gets only what is left of its
        // timeout, so it always ends by `endsBy`, however long the save took.
        const timeoutSeconds = Math.ceil((endsByMs - DEADLINE_GRACE_MS - Date.now()) / 1000);

        try {
            if (timeoutSeconds < 1) {
                throw new Error('The execution was saved too late to start the command');
            }

            const { deadlineExceeded, ...output } = await runCommand({
                argv: buildNodeCommand(target, {
                    ...nodeCommand,
                    timeoutSeconds,
                }),
                deadlineMs: endsByMs - Date.now(),
                maxOutputBytes: MAX_OUTPUT_BYTES,
            });
            const stop = stops.get(record.executionId);
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

        records.update(finished);

        // No command and no output in the logs: they can hold secrets.
        logger.info({
            ...logFields,
            status: finished.status,
            exitCode: finished.exitCode,
        }, '🏁 Node command finished');
    };

    return {
        async start(nodeCommand) {
            const requestHash = hashRequest(nodeCommand);
            // Before the host: a repeated request needs no node list.
            const existing = records.get(nodeCommand.executionId);

            if (existing !== undefined) {
                return existingResult(existing, requestHash);
            }

            let target: HostTarget | undefined;

            try {
                target = await resolveHost(nodeCommand.host);
            } catch (error) {
                logger.error({ err: wrapError(error) }, '❌ Failed to read the cluster nodes');

                return { kind: 'hosts-unavailable' };
            }

            if (target === undefined) {
                return { kind: 'unknown-host' };
            }

            const startedAt = new Date();

            if (reservedSlots >= MAX_CONCURRENT_EXECUTIONS) {
                return { kind: 'busy' };
            }

            reservedSlots += 1;

            const record: ExecutionRecord = {
                executionId: nodeCommand.executionId,
                host: nodeCommand.host,
                requestHash,
                status: 'running',
                startedAt: startedAt.toISOString(),
                endsBy: new Date(startedAt.getTime() + nodeCommand.timeoutSeconds * 1000 + DEADLINE_GRACE_MS).toISOString(),
            };

            // Active before the save: a stop that sees the new record goes through the stop marker.
            active.set(record.executionId, target);

            const release = () => {
                reservedSlots -= 1;
                active.delete(record.executionId);
                stops.delete(record.executionId);
            };

            // Saved before the command starts, so a restart never starts it again.
            let created: boolean;

            try {
                created = await records.create(record);
            } catch (error) {
                release();
                throw error;
            }

            if (!created) {
                release();

                const raced = records.get(nodeCommand.executionId);

                return raced === undefined ? { kind: 'conflict' } : existingResult(raced, requestHash);
            }

            logger.info({
                executionId: record.executionId,
                host: record.host,
                timeoutSeconds: nodeCommand.timeoutSeconds,
            }, '▶️ Node command started');

            void execute(nodeCommand, target, record)
                .catch((error: unknown) => {
                    logger.error({
                        err: wrapError(error),
                        executionId: record.executionId,
                    }, '❌ A node command failed unexpectedly');
                })
                .finally(release);

            return {
                kind: 'started',
                record,
            };
        },
        get: records.get,
        async stop(executionId) {
            const record = records.get(executionId);

            if (record === undefined) {
                return { kind: 'not-found' };
            }

            // Only while the record is `running`: a finished one is no longer the active command's.
            const target = record.status === 'running' ? active.get(executionId) : undefined;

            if (target === undefined) {
                return {
                    kind: 'not-running',
                    record,
                };
            }

            // A repeated stop waits for the last one, and tries again only when that one failed.
            const previous = stops.get(executionId);

            if (previous !== undefined) {
                if (await previous.confirmed) {
                    return {
                        kind: 'stopped',
                        record: records.get(executionId) ?? record,
                    };
                }

                if (stops.get(executionId) === previous) {
                    stops.delete(executionId);
                }

                return this.stop(executionId);
            }

            const confirmed = runStop(target, record);

            stops.set(executionId, {
                requestedAt: new Date().toISOString(),
                confirmed,
            });

            if (!await confirmed) {
                return { kind: 'stop-failed' };
            }

            return {
                kind: 'stopped',
                record: records.get(executionId) ?? record,
            };
        },
    };
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

/** Records left `running` by an earlier process become `interrupted`, never retried. */
export function markInterruptedExecutions(
    records: ExecutionRecords,
    logger: Pick<FastifyBaseLogger, 'warn'>
): void {
    const now = new Date().toISOString();

    for (const record of records.list()) {
        if (record.status === 'running') {
            records.update({
                ...record,
                status: 'interrupted',
                finishedAt: now,
                error: `node-shell restarted while the command ran; it may still run on the host until ${record.endsBy}`,
            });
            logger.warn({
                executionId: record.executionId,
                host: record.host,
                endsBy: record.endsBy,
            }, '⚠️ Marked a node command as interrupted by a restart');
        }
    }
}
