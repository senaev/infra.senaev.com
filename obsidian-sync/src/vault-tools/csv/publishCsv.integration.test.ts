import {
    readFile, rename, symlink, writeFile,
} from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import * as diffModule from 'senaev-utils/src/files/createFileDiffAsync';

import { createTestVault, type TestVault } from '../createTestVault';
import { hashBytes } from '../access/vaultFiles';

import { publishCsv } from './publishCsv';

let vault: TestVault | undefined;
const original = 'id\n001\n';
const updated = 'id\n002\n';
const expectedHash = hashBytes(Buffer.from(original));

afterEach(async () => {
    vi.restoreAllMocks();
    await vault?.remove();
});

it('rechecks the source after diff calculation before publishing', async () => {
    const active = await createTestVault({ 'data.csv': original });

    vault = active;
    vi.spyOn(diffModule, 'createFileDiffAsync').mockImplementation(async () => {
        await writeFile(active.path('data.csv'), 'id\nexternal\n');

        return {
            diff: '',
            diffTruncated: false,
        };
    });
    await expect(publishCsv(active.config, {
        path: 'data.csv',
        expectedHash,
        original,
        csv: updated,
    }, createCommandExecution())).rejects.toMatchObject({ code: 'conflict' });
    expect(await readFile(active.path('data.csv'), 'utf8')).toBe('id\nexternal\n');
});

it('detects a moved publication directory without following its replacement symlink', async () => {
    const active = await createTestVault({
        'target/data.csv': original,
        'other/data.csv': 'id\nuntouched\n',
    });

    vault = active;
    vi.spyOn(diffModule, 'createFileDiffAsync').mockImplementation(async () => {
        await rename(active.path('target'), active.path('moved'));
        await symlink(active.path('other'), active.path('target'));

        return {
            diff: '',
            diffTruncated: false,
        };
    });
    await expect(publishCsv(active.config, {
        path: 'target/data.csv',
        expectedHash,
        original,
        csv: updated,
    }, createCommandExecution())).rejects.toMatchObject({ code: 'forbidden_path' });
    expect(await readFile(active.path('other/data.csv'), 'utf8')).toBe('id\nuntouched\n');
    expect(await readFile(active.path('moved/data.csv'), 'utf8')).toBe(original);
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

    vi.spyOn(diffModule, 'createFileDiffAsync').mockImplementation(async () => {
        entered();
        await blocked;

        return {
            diff: '',
            diffTruncated: false,
        };
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
    expect(await publishCsv(active.config, args, createCommandExecution())).toMatchObject({
        changed: true,
        hash: hashBytes(Buffer.from(updated)),
    });
});
