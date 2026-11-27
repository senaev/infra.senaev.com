import { createHash } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';

import {
    buildNodeCommand, type NodeCommand, SSH_CONNECT_TIMEOUT_SECONDS,
} from './buildNodeCommand';
import type { ExecutionRecord } from './executionRecord';
import type { ExecutionStore } from './executionStore';
import type { HostResolver, HostTarget } from './nodeHosts';
import type { CommandResult } from './runCommand';

export const MAX_TIMEOUT_SECONDS = 3600;
// One command at a time on all hosts: a second one waits for the first to finish (429).
export const MAX_CONCURRENT_EXECUTIONS = 1;
export const MAX_OUTPUT_BYTES = 1024 * 1024;
// The local process gets this long after the command timeout before node-shell kills it: the
// SSH connection, and the stop of the systemd unit on the host (SIGTERM, then SIGKILL).
const DEADLINE_GRACE_MS = (SSH_CONNECT_TIMEOUT_SECONDS + 60) * 1000;

export type StartResult =
    | { kind: 'started'; record: ExecutionRecord }
    | { kind: 'existing'; record: ExecutionRecord }
    | { kind: 'conflict' }
    | { kind: 'unknown-host' }
    | { kind: 'hosts-unavailable' }
    | { kind: 'busy' };

export type ExecutionManager = {
    /**
     * Starts the command once per execution ID and returns at once. A repeated request with the
     * same ID returns the saved execution and never starts the command again, also after a
     * restart; the same ID with another request is a conflict.
     */
    start: (nodeCommand: NodeCommand) => Promise<StartResult>;
    get: (executionId: string) => Promise<ExecutionRecord | undefined>;
    /** Resolves when every command started by this process has ended. For tests and shutdown. */
    idle: () => Promise<void>;
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

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

export function createExecutionManager({
    store, hosts, run, logger, now = () => new Date(),
}: {
    store: ExecutionStore;
    hosts: HostResolver;
    run: (options: { argv: readonly string[]; deadlineMs: number; maxOutputBytes: number }) => Promise<CommandResult>;
    logger: Pick<FastifyBaseLogger, 'info' | 'error'>;
    now?: () => Date;
}): ExecutionManager {
    const running = new Set<Promise<void>>();
    // Taken synchronously right after the check, before any await, so concurrent starts cannot
    // all pass the check; given back when the command ends or never starts.
    let reservedSlots = 0;
    // Results the store failed to save: served from here, and saved again on the next read, so a
    // transient write failure does not leave the record `running`.
    const unsaved = new Map<string, ExecutionRecord>();

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
                err: toError(error),
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

        try {
            const result = await run({
                argv: buildNodeCommand(target, nodeCommand),
                deadlineMs: nodeCommand.timeoutSeconds * 1000 + DEADLINE_GRACE_MS,
                maxOutputBytes: MAX_OUTPUT_BYTES,
            });

            finished = {
                ...record,
                status: result.deadlineExceeded ? 'failed' : 'completed',
                finishedAt: now().toISOString(),
                exitCode: result.exitCode,
                signal: result.signal,
                stdout: result.stdout,
                stderr: result.stderr,
                outputTruncated: result.outputTruncated,
                ...result.deadlineExceeded ? { error: 'node-shell killed the command at its deadline' } : {},
            };
        } catch (error) {
            finished = {
                ...record,
                status: 'failed',
                finishedAt: now().toISOString(),
                error: toError(error).message,
            };
        }

        try {
            await store.update(finished);
        } catch (error) {
            unsaved.set(finished.executionId, finished);
            logger.error({
                ...logFields,
                err: toError(error),
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
            // A repeated request gets its saved record even when its host is no longer a node or
            // the node list cannot be read now: only a new execution needs the host.
            const existing = await read(nodeCommand.executionId);

            if (existing !== undefined) {
                return existingResult(existing, requestHash);
            }

            let target: HostTarget | undefined;

            try {
                target = await hosts.resolve(nodeCommand.host);
            } catch (error) {
                logger.error({ err: toError(error) }, '❌ Failed to read the cluster nodes');

                return { kind: 'hosts-unavailable' };
            }

            if (target === undefined) {
                return { kind: 'unknown-host' };
            }

            if (reservedSlots >= MAX_CONCURRENT_EXECUTIONS) {
                return { kind: 'busy' };
            }

            reservedSlots += 1;

            const record: ExecutionRecord = {
                executionId: nodeCommand.executionId,
                host: nodeCommand.host,
                requestHash,
                status: 'running',
                startedAt: now().toISOString(),
            };

            // Saved before the command starts: if node-shell restarts now, the ID is taken and the
            // command is not started a second time.
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

            const execution = execute(nodeCommand, target, record)
                .catch((error: unknown) => {
                    logger.error({
                        err: toError(error),
                        executionId: record.executionId,
                    }, '❌ A node command failed unexpectedly');
                })
                .finally(() => {
                    reservedSlots -= 1;
                    running.delete(execution);
                });

            running.add(execution);

            return {
                kind: 'started',
                record,
            };
        },
        get: read,
        async idle() {
            await Promise.all(running);
        },
    };
}

/**
 * At startup, no command of this process runs yet: a record still `running` was left by an
 * earlier process. Its outcome is unknown, and it is not retried.
 */
export async function markInterruptedExecutions(
    store: ExecutionStore,
    logger: Pick<FastifyBaseLogger, 'warn'>,
    now = new Date()
): Promise<void> {
    for (const record of await store.list()) {
        if (record.status === 'running') {
            await store.update({
                ...record,
                status: 'interrupted',
                finishedAt: now.toISOString(),
                error: 'node-shell restarted while the command ran; the outcome is unknown',
            });
            logger.warn({
                executionId: record.executionId,
                host: record.host,
            }, '⚠️ Marked a node command as interrupted by a restart');
        }
    }
}
