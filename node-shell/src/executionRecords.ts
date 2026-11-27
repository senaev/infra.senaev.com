import type { FastifyBaseLogger } from 'fastify';
import { wrapError } from 'senaev-utils/src/utils/Error/wrapError';

import type { ExecutionRecord } from './executionRecord';
import type { ExecutionStore } from './executionStore';

const RETRY_DELAY_MS = 5000;

export type ExecutionRecords = {
    /** The latest record, also one that is not on disk yet. */
    get: (executionId: string) => ExecutionRecord | undefined;
    list: () => ExecutionRecord[];
    /** Resolves once the record is on disk; `false` when the ID exists. */
    create: (record: ExecutionRecord) => Promise<boolean>;
    /** Replaces the record at once and saves it in the background, again after a failure. */
    update: (record: ExecutionRecord) => void;
    /** Removes the records not changed for `maxAgeMs`; returns how many. */
    removeOlderThan: (maxAgeMs: number, now: Date) => Promise<number>;
};

/**
 * All records in memory, each saved to the store. The writes of one execution run one at a time,
 * and each saves the latest record, so an older record never overwrites a newer one.
 */
export async function loadExecutionRecords({
    store, logger,
}: {
    store: ExecutionStore;
    logger: Pick<FastifyBaseLogger, 'error'>;
}): Promise<ExecutionRecords> {
    const records = new Map((await store.list()).map((record) => [
        record.executionId,
        record,
    ]));
    // The IDs whose latest record is not saved yet, and the IDs with a write in progress.
    const unsaved = new Set<string>();
    const writing = new Set<string>();

    const write = async (executionId: string): Promise<void> => {
        writing.add(executionId);

        while (unsaved.has(executionId)) {
            const record = records.get(executionId);

            unsaved.delete(executionId);

            if (record === undefined) {
                break;
            }

            try {
                await store.update(record);
            } catch (error) {
                // Unless a newer record came meanwhile, this one is written again.
                unsaved.add(executionId);
                logger.error({
                    err: wrapError(error),
                    executionId,
                }, '❌ Failed to save a node command record; trying again');
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, RETRY_DELAY_MS).unref();
                });
            }
        }

        writing.delete(executionId);
    };

    const save = (executionId: string): void => {
        unsaved.add(executionId);

        if (!writing.has(executionId)) {
            void write(executionId);
        }
    };

    return {
        get: (executionId) => records.get(executionId),
        list: () => [...records.values()],
        async create(record) {
            const { executionId } = record;

            if (records.has(executionId)) {
                return false;
            }

            // In memory at once, and the updates that come before the file exists wait for it.
            records.set(executionId, record);
            writing.add(executionId);

            try {
                if (!await store.create(record)) {
                    throw new Error(`A record of ${executionId} is on disk but was not loaded`);
                }
            } catch (error) {
                records.delete(executionId);
                unsaved.delete(executionId);
                writing.delete(executionId);
                throw error;
            }

            writing.delete(executionId);

            if (unsaved.has(executionId)) {
                void write(executionId);
            }

            return true;
        },
        update(record) {
            records.set(record.executionId, record);
            save(record.executionId);
        },
        async removeOlderThan(maxAgeMs, now) {
            const removed = await store.removeOlderThan(maxAgeMs, now);

            for (const executionId of removed) {
                // A record saved meanwhile is on disk again: it stays.
                if (!unsaved.has(executionId) && !writing.has(executionId)) {
                    records.delete(executionId);
                }
            }

            return removed.length;
        },
    };
}
