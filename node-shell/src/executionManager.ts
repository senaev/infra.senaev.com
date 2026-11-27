import { createHash } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';
import { wrapError } from 'senaev-utils/src/utils/Error/wrapError';

import {
    buildNodeCommand, buildStopCommand, type NodeCommand, SSH_CONNECT_TIMEOUT_SECONDS, UNIT_STOP_TIMEOUT_SECONDS,
} from './buildNodeCommand';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionRecords } from './executionRecords';
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
    get: (executionId: string) => ExecutionRecord | undefined;
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
    records, run, logger, holds: initialHolds,
}: {
    records: ExecutionRecords;
    holds: ReadonlyMap<string, Date>;
    run: (options: { argv: readonly string[]; deadlineMs: number; maxOutputBytes: number }) => Promise<CommandResult>;
    logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
}): ExecutionManager {
    // Taken before any await, so concurrent starts cannot all pass the check.
    let reservedSlots = 0;
    // The commands that may still run on their host, by execution ID, until their `endsBy`: no new
    // command starts before. Changed only synchronously, by the execution it belongs to.
    const holds = new Map(initialHolds);
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

    // When the confirmed stop of the execution was asked for. A failed stop that a retry replaced
    // meanwhile gives way to the retry.
    const confirmedStopAt = async (executionId: string): Promise<string | undefined> => {
        for (;;) {
            const stop = stops.get(executionId);

            if (stop === undefined) {
                return undefined;
            }

            if (await stop.confirmed) {
                return stop.requestedAt;
            }

            if (stops.get(executionId) === stop) {
                return undefined;
            }
        }
    };

    const isHeld = (now: Date): boolean => [...holds.values()].some((endsBy) => endsBy > now);

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

            const stoppedAt = await confirmedStopAt(record.executionId);

            // A signal ended the waiter, or ssh exited 255 (a dropped connection): the unit may still
            // run, unless a confirmed stop ended it.
            unitMayRun = stoppedAt === undefined && (result.exitCode === null || (target.kind === 'ssh' && result.exitCode === 255));
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

        // The result and the hold change together, so a stop sees both or neither.
        records.update(finished);

        if (unitMayRun) {
            holds.set(record.executionId, new Date(record.endsBy));

            logger.info({
                ...logFields,
                endsBy: record.endsBy,
            }, '⏳ ssh ended without the exit of the command; no new command until its unit has surely ended');
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

            if (reservedSlots >= MAX_CONCURRENT_EXECUTIONS || isHeld(startedAt)) {
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
            const activeTarget = record.status === 'running' ? active.get(executionId) : undefined;

            if (activeTarget !== undefined) {
                // A repeated stop reuses the last one, so a failed retry cannot undo a confirmed stop.
                const previous = stops.get(executionId);

                if (previous !== undefined) {
                    if (await previous.confirmed) {
                        return {
                            kind: 'stopped',
                            record: records.get(executionId) ?? record,
                        };
                    }

                    // It failed, and the command may have ended meanwhile: start over from its state now.
                    if (stops.get(executionId) === previous) {
                        stops.delete(executionId);
                    }

                    return this.stop(executionId);
                }

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
                    record: records.get(executionId) ?? record,
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

            // The latest record: another stop may have changed it during this one.
            const { mayStillRun: _mayStillRun, ...rest } = records.get(executionId) ?? record;
            const stopped: ExecutionRecord = {
                ...rest,
                stoppedAt: new Date().toISOString(),
            };

            holds.delete(executionId);
            records.update(stopped);

            return {
                kind: 'stopped',
                record: stopped,
            };
        },
    };
}

/**
 * Records left `running` by an earlier process become `interrupted`, never retried. Returns the
 * `endsBy` of each command that may still run, by execution ID: no new command starts before it.
 */
export function markInterruptedExecutions(
    records: ExecutionRecords,
    logger: Pick<FastifyBaseLogger, 'warn'>
): Map<string, Date> {
    const now = new Date();
    const holds = new Map<string, Date>();

    for (const record of records.list()) {
        const endsBy = new Date(record.endsBy);

        if ((record.status === 'running' || record.mayStillRun === true) && endsBy > now) {
            holds.set(record.executionId, endsBy);
        }

        if (record.status === 'running') {
            records.update({
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

    return holds;
}
