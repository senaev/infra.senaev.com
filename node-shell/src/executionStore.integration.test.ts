import {
    mkdtemp, readdir, rm, utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import type { ExecutionRecord } from './executionRecord';
import { createExecutionStore, type ExecutionStore } from './executionStore';

const record: ExecutionRecord = {
    executionId: 'e1',
    host: 'hetzner',
    requestHash: 'hash',
    status: 'running',
    startedAt: '2026-11-22T00:00:00.000Z',
};

let directory: string;
let store: ExecutionStore;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'node-shell-store-'));
    store = await createExecutionStore(join(directory, 'executions'));
});

afterEach(async () => {
    await rm(directory, {
        recursive: true,
        force: true,
    });
});

describe('createExecutionStore', () => {
    it('creates a record once and reads it back', async () => {
        await expect(store.create(record)).resolves.toBe(true);
        await expect(store.create({
            ...record,
            requestHash: 'other',
        })).resolves.toBe(false);
        await expect(store.read('e1')).resolves.toEqual(record);
        await expect(store.read('missing')).resolves.toBeUndefined();
    });

    it('creates only one record when two requests race for the same ID', async () => {
        const results = await Promise.all([
            store.create(record),
            store.create(record),
            store.create(record),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('replaces a record on update and leaves no temporary file', async () => {
        await store.create(record);
        await store.update({
            ...record,
            status: 'completed',
            exitCode: 0,
        });

        await expect(store.read('e1')).resolves.toMatchObject({
            status: 'completed',
            exitCode: 0,
        });
        await expect(readdir(join(directory, 'executions'))).resolves.toEqual(['e1.json']);
    });

    it('lists the records and removes the old ones', async () => {
        await store.create(record);
        await store.create({
            ...record,
            executionId: 'e2',
        });

        const old = new Date('2026-11-01T00:00:00.000Z');

        await utimes(join(directory, 'executions', 'e1.json'), old, old);

        expect((await store.list()).map(({ executionId }) => executionId).sort()).toEqual([
            'e1',
            'e2',
        ]);
        await expect(store.removeOlderThan(24 * 60 * 60 * 1000, new Date())).resolves.toBe(1);
        expect((await store.list()).map(({ executionId }) => executionId)).toEqual(['e2']);
    });
});
