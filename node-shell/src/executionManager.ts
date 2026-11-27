import { createHash } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { wrapError } from 'senaev-utils/src/utils/Error/wrapError';

import {
    buildNodeCommand, buildStopCommand, type NodeCommand, SSH_CONNECT_TIMEOUT_SECONDS, UNIT_STOP_TIMEOUT_SECONDS,
} from './buildNodeCommand';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionStore } from './executionStore';
import {
    type HostTarget, hostTarget, resolveHost,
} from './nodeHosts';
import type { CommandResult } from './runCommand';

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
    get: (executionId: string) => Promise<ExecutionRecord | undefined>;
    /** Stops the systemd unit of a command that may still run; returns when it has stopped. */
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
    store, run, logger, busyUntil,
}: {
    store: ExecutionStore;
    busyUntil: Date | undefined;
    run: (options: { argv: readonly string[]; deadlineMs: number; maxOutputBytes: number }) => Promise<CommandResult>;
    logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
}): ExecutionManager {
    // Taken before any await, so concurrent starts cannot all pass the check.
    let reservedSlots = 0;
    // No new command before this time: an earlier command may still run on its host.
    let holdUntil = busyUntil;
    // Results the store failed to save; saved again on the next read.
    const unsaved = new Map<string, ExecutionRecord>();
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
            const { exitCode } = await run({
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

    // Every hold comes from a record with `mayStillRun`, so it is computed again after a stop.
    const recomputeHold = async (): Promise<void> => {
        holdUntil = latestHold([
            ...await store.list(),
            ...unsaved.values(),
        ], new Date());
    };

    const read = async (executionId: string): Promise<ExecutionRecord | undefined> => {
        const pending = unsaved.get(executionId);

        if (pending === undefined) {
            return store.read(executionId);
        }

        try {
            await store.update(pending);
            unsaved.delete(executionId);
        } catch (error) {
            logger.error({
                err: wrapError(error),
                executionId,
            }, '❌ Failed again to save the result of a node command');
        }

        return pending;
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
        let unitMayRun = false;
        const endsByMs = new Date(record.endsBy).getTime();
        // The record is saved before the command starts: the command gets only what is left of its
        // timeout, so it always ends by `endsBy`, however long the save took.
        const timeoutSeconds = Math.ceil((endsByMs - DEADLINE_GRACE_MS - Date.now()) / 1000);

        try {
            if (timeoutSeconds < 1) {
                throw new Error('The execution was saved too late to start the command');
            }

            const result = await run({
                argv: buildNodeCommand(target, {
                    ...nodeCommand,
                    timeoutSeconds,
                }),
                deadlineMs: endsByMs - Date.now(),
                maxOutputBytes: MAX_OUTPUT_BYTES,
            });

            // A signal ended the waiter, or ssh exited 255 (a dropped connection): the unit may still run.
            unitMayRun = result.exitCode === null || (target.kind === 'ssh' && result.exitCode === 255);

            const stop = stops.get(record.executionId);
            const stoppedAt = stop !== undefined && await stop.confirmed ? stop.requestedAt : undefined;
            let status: ExecutionRecord['status'] = 'completed';

            if (result.deadlineExceeded) {
                status = 'failed';
            } else if (stoppedAt !== undefined) {
                status = 'stopped';
            }

            finished = {
                ...record,
                status,
                ...stoppedAt === undefined ? {} : { stoppedAt },
                finishedAt: new Date().toISOString(),
                exitCode: result.exitCode,
                signal: result.signal,
                stdout: result.stdout,
                stderr: result.stderr,
                outputTruncated: result.outputTruncated,
                ...result.deadlineExceeded ? { error: 'node-shell killed the command at its deadline' } : {},
                ...unitMayRun ? { mayStillRun: true as const } : {},
            };
        } catch (error) {
            finished = {
                ...record,
                status: 'failed',
                finishedAt: new Date().toISOString(),
                error: stringifyUnknownError(error),
            };
        }

        if (unitMayRun) {
            const endsBy = new Date(record.endsBy);

            if (holdUntil === undefined || endsBy > holdUntil) {
                holdUntil = endsBy;
            }

            logger.info({
                ...logFields,
                endsBy: record.endsBy,
            }, '⏳ ssh ended without the exit of the command; no new command until its unit has surely ended');
        }

        try {
            await store.update(finished);
        } catch (error) {
            unsaved.set(finished.executionId, finished);
            logger.error({
                ...logFields,
                err: wrapError(error),
            }, '❌ Failed to save the result of a node command; kept in memory until it is saved');
        }

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
            const existing = await read(nodeCommand.executionId);

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

            if (reservedSlots >= MAX_CONCURRENT_EXECUTIONS || (holdUntil !== undefined && startedAt < holdUntil)) {
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

            // Saved before the command starts, so a restart never starts it again.
            let created: boolean;

            try {
                created = await store.create(record);
            } catch (error) {
                reservedSlots -= 1;
                throw error;
            }

            if (!created) {
                reservedSlots -= 1;

                const raced = await store.read(nodeCommand.executionId);

                return raced === undefined ? { kind: 'conflict' } : existingResult(raced, requestHash);
            }

            logger.info({
                executionId: record.executionId,
                host: record.host,
                timeoutSeconds: nodeCommand.timeoutSeconds,
            }, '▶️ Node command started');

            active.set(record.executionId, target);
            void execute(nodeCommand, target, record)
                .catch((error: unknown) => {
                    logger.error({
                        err: wrapError(error),
                        executionId: record.executionId,
                    }, '❌ A node command failed unexpectedly');
                })
                .finally(() => {
                    reservedSlots -= 1;
                    active.delete(record.executionId);
                    stops.delete(record.executionId);
                });

            return {
                kind: 'started',
                record,
            };
        },
        get: read,
        async stop(executionId) {
            const record = await read(executionId);

            if (record === undefined) {
                return { kind: 'not-found' };
            }

            const activeTarget = active.get(executionId);

            if (activeTarget !== undefined) {
                const confirmed = runStop(activeTarget, record);

                stops.set(executionId, {
                    requestedAt: new Date().toISOString(),
                    confirmed,
                });

                if (!await confirmed) {
                    return { kind: 'stop-failed' };
                }

                return {
                    kind: 'stopped',
                    record: await read(executionId) ?? record,
                };
            }

            // A command whose end node-shell did not see (a restart, a dropped ssh) may still run.
            if (record.mayStillRun !== true || new Date(record.endsBy) <= new Date()) {
                return {
                    kind: 'not-running',
                    record,
                };
            }

            if (!await runStop(hostTarget(record.host), record)) {
                return { kind: 'stop-failed' };
            }

            const { mayStillRun: _mayStillRun, ...rest } = record;
            const stopped: ExecutionRecord = {
                ...rest,
                stoppedAt: new Date().toISOString(),
            };

            unsaved.delete(executionId);
            await store.update(stopped);
            await recomputeHold();

            return {
                kind: 'stopped',
                record: stopped,
            };
        },
    };
}

// The latest `endsBy` still ahead among the records whose command may still run.
function latestHold(records: readonly ExecutionRecord[], now: Date): Date | undefined {
    let latest: Date | undefined;

    for (const record of records) {
        const endsBy = new Date(record.endsBy);

        if ((record.status === 'running' || record.mayStillRun === true) && endsBy > now && (latest === undefined || endsBy > latest)) {
            latest = endsBy;
        }
    }

    return latest;
}

/**
 * Records left `running` by an earlier process become `interrupted`, never retried. Returns the
 * latest `endsBy` of a command that may still run: no new command starts before it.
 */
export async function markInterruptedExecutions(
    store: ExecutionStore,
    logger: Pick<FastifyBaseLogger, 'warn'>
): Promise<Date | undefined> {
    const now = new Date();
    const records = await store.list();

    for (const record of records) {
        if (record.status === 'running') {
            await store.update({
                ...record,
                status: 'interrupted',
                finishedAt: now.toISOString(),
                error: 'node-shell restarted while the command ran; the outcome is unknown',
                mayStillRun: true,
            });
            logger.warn({
                executionId: record.executionId,
                host: record.host,
                endsBy: record.endsBy,
            }, '⚠️ Marked a node command as interrupted by a restart');
        }
    }

    return latestHold(records, now);
}
