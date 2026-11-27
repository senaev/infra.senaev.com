import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import type { ExecutionRecord } from './executionRecord';
import { loadExecutionRecords } from './executionRecords';
import type { ExecutionStore } from './executionStore';

const settle = () => new Promise<void>((resolve) => {
    setImmediate(resolve);
});

const record: ExecutionRecord = {
    executionId: 'e1',
    host: 'hetzner',
    requestHash: 'hash',
    status: 'running',
    startedAt: '2026-11-22T10:00:00.000Z',
    endsBy: '2026-11-22T10:01:40.000Z',
};
const completed: ExecutionRecord = {
    ...record,
    status: 'completed',
    exitCode: 0,
};
const stopped: ExecutionRecord = {
    ...completed,
    stoppedAt: '2026-11-22T10:00:10.000Z',
};

const logger = { error: vi.fn() };

function createMemoryStore(): ExecutionStore & { files: Map<string, ExecutionRecord> } {
    const files = new Map<string, ExecutionRecord>();

    return {
        files,
        create: (created) => {
            if (files.has(created.executionId)) {
                return Promise.resolve(false);
            }

            files.set(created.executionId, created);

            return Promise.resolve(true);
        },
        read: (executionId) => Promise.resolve(files.get(executionId)),
        update: (updated) => {
            files.set(updated.executionId, updated);

            return Promise.resolve();
        },
        list: () => Promise.resolve([...files.values()]),
        removeOlderThan: () => Promise.resolve([...files.keys()]),
    };
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((onResolve) => {
        resolve = onResolve;
    });

    return {
        promise,
        resolve,
    };
}

let store: ReturnType<typeof createMemoryStore>;

beforeEach(() => {
    store = createMemoryStore();
    logger.error.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('loadExecutionRecords', () => {
    it('loads the records of the store', async () => {
        store.files.set('e1', completed);

        const records = await loadExecutionRecords({
            store,
            logger,
        });

        expect(records.get('e1')).toEqual(completed);
        expect(records.get('unknown')).toBeUndefined();
        expect(records.list()).toEqual([completed]);
    });

    it('creates a record once, on disk before it resolves', async () => {
        const records = await loadExecutionRecords({
            store,
            logger,
        });

        await expect(records.create(record)).resolves.toBe(true);
        expect(store.files.get('e1')).toEqual(record);
        await expect(records.create(completed)).resolves.toBe(false);
        expect(records.get('e1')).toEqual(record);
    });

    it('removes a record from memory when it cannot be created', async () => {
        const records = await loadExecutionRecords({
            store,
            logger,
        });

        store.create = () => Promise.reject(new Error('disk full'));

        await expect(records.create(record)).rejects.toThrow('disk full');
        expect(records.get('e1')).toBeUndefined();
    });

    it('serves an update at once, and saves it after the record is created', async () => {
        const created = deferred();
        const { create } = store;
        const records = await loadExecutionRecords({
            store,
            logger,
        });

        store.create = async (createdRecord) => {
            await created.promise;

            return create(createdRecord);
        };

        const creating = records.create(record);

        expect(records.get('e1')).toEqual(record);
        records.update(completed);
        expect(records.get('e1')).toEqual(completed);
        await settle();
        expect(store.files.has('e1')).toBe(false);

        created.resolve();
        await creating;
        await settle();
        expect(store.files.get('e1')).toEqual(completed);
    });

    it('writes the records of one execution one at a time, and always the latest one', async () => {
        const firstWrite = deferred();
        const written: ExecutionRecord[] = [];
        const records = await loadExecutionRecords({
            store,
            logger,
        });

        await records.create(record);
        store.update = async (updated) => {
            written.push(updated);

            if (written.length === 1) {
                await firstWrite.promise;
            }

            store.files.set(updated.executionId, updated);
        };

        records.update(completed);
        records.update({
            ...completed,
            stdout: 'intermediate',
        });
        records.update(stopped);
        await settle();
        expect(written).toEqual([completed]);

        firstWrite.resolve();
        await settle();
        expect(written).toEqual([
            completed,
            stopped,
        ]);
        expect(store.files.get('e1')).toEqual(stopped);
    });

    it('logs a failed write and writes the latest record again after a delay', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout'] });

        const { update } = store;
        const records = await loadExecutionRecords({
            store,
            logger,
        });

        await records.create(record);
        store.update = () => Promise.reject(new Error('disk full'));
        records.update(completed);
        await settle();

        expect(logger.error).toHaveBeenCalledOnce();
        expect(records.get('e1')).toEqual(completed);
        expect(store.files.get('e1')).toEqual(record);

        store.update = update;
        records.update(stopped);
        await vi.advanceTimersByTimeAsync(5000);
        await settle();

        expect(store.files.get('e1')).toEqual(stopped);
    });

    it('removes old records from memory, but not one that is being written', async () => {
        const write = deferred();
        const records = await loadExecutionRecords({
            store,
            logger,
        });

        await records.create(record);
        await records.create({
            ...record,
            executionId: 'e2',
        });
        store.update = async (updated) => {
            await write.promise;
            store.files.set(updated.executionId, updated);
        };

        records.update({
            ...completed,
            executionId: 'e2',
        });

        await expect(records.removeOlderThan(0, new Date())).resolves.toBe(2);
        expect(records.get('e1')).toBeUndefined();
        expect(records.get('e2')).toMatchObject({ status: 'completed' });

        write.resolve();
        await settle();
    });
});
