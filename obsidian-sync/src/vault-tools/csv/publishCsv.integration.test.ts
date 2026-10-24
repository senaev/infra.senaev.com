import { readFile, writeFile } from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';
import { hashBytes } from '../access/vaultFiles';
import * as vaultFiles from '../access/vaultFiles';

import { publishCsv } from './publishCsv';

let vault: TestVault | undefined;
const original = 'id\n001\n';
const updated = 'id\n002\n';
const expectedHash = hashBytes(Buffer.from(original));

afterEach(async () => {
    vi.restoreAllMocks();
    await vault?.remove();
});

it('rechecks the source before publishing', async () => {
    const active = await createTestVault({ 'data.csv': original });

    vault = active;
    vi.spyOn(vaultFiles, 'resolveExistingFile').mockImplementationOnce(async () => {
        await writeFile(active.path('data.csv'), 'id\nexternal\n');

        return active.path('data.csv');
    });
    await expect(publishCsv(active.config, {
        path: 'data.csv',
        expectedHash,
        original,
        csv: updated,
    }, createCommandExecution())).rejects.toMatchObject({ code: 'conflict' });
    expect(await readFile(active.path('data.csv'), 'utf8')).toBe('id\nexternal\n');
});

it('reserves the path while preparing a publication and releases it after cancellation', async () => {
    const active = await createTestVault({ 'data.csv': original });

    vault = active;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });

    vi.spyOn(vaultFiles, 'resolveExistingFile').mockImplementationOnce(async () => {
        entered();
        await blocked;

        return active.path('data.csv');
    });
    const controller = new AbortController();
    const args = {
        path: 'data.csv',
        expectedHash,
        original,
        csv: updated,
    };
    const first = publishCsv(active.config, args, createCommandExecution({ signal: controller.signal }));
    const aborted = expect(first).rejects.toThrow('cancelled');

    await started;
    await expect(publishCsv(active.config, args, createCommandExecution())).rejects.toMatchObject({ code: 'conflict' });
    controller.abort(new Error('cancelled'));
    release();
    await aborted;
    expect(await readFile(active.path('data.csv'), 'utf8')).toBe(original);
    vi.restoreAllMocks();
    const saved = await publishCsv(active.config, args, createCommandExecution());

    expect(saved).not.toHaveProperty('diff');
    expect(saved).not.toHaveProperty('diffTruncated');
    expect(saved).toMatchObject({
        changed: true,
        hash: hashBytes(Buffer.from(updated)),
    });
});

it.each([
    'created',
    'changed',
    'removed',
])('rejects params %s between the snapshot and publication', async (mode) => {
    const { unlink } = await import('node:fs/promises');
    const params = '{"sort":[]}';
    const active = await createTestVault({
        'data.csv': original,
        ...mode === 'created' ? {} : { 'data.csv.params.json': params },
    });

    vault = active;
    vi.spyOn(vaultFiles, 'resolveExistingFile').mockImplementationOnce(async () => {
        if (mode === 'removed') {
            await unlink(active.path('data.csv.params.json'));
        } else {
            await writeFile(active.path('data.csv.params.json'), '{"sort":[{"expression":"id","direction":"DESC"}]}');
        }

        return active.path('data.csv');
    });
    await expect(publishCsv(active.config, {
        path: 'data.csv',
        expectedHash,
        original,
        csv: updated,
        paramsHash: mode === 'created' ? null : hashBytes(Buffer.from(params)),
    }, createCommandExecution())).rejects.toMatchObject({ code: 'conflict' });
    expect(await readFile(active.path('data.csv'), 'utf8')).toBe(original);
});
