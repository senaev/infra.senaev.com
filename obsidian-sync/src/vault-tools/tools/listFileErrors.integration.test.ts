import { unlink } from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import * as vaultFiles from '../access/vaultFiles';
import { createTestVault, type TestVault } from '../createTestVault';

import { listTool } from './listTool';

let vault: TestVault;

afterEach(async () => {
    vi.restoreAllMocks();
    await vault?.remove();
});

it('retains other entries and advances pagination when a file disappears after stat', async () => {
    vault = await createTestVault({
        'a.csv': 'a',
        'b.csv': 'b',
        'c.csv': 'c',
    });
    const resolve = vaultFiles.resolveExistingFile;

    vi.spyOn(vaultFiles, 'resolveExistingFile').mockImplementationOnce(async (...args) => {
        await unlink(vault.path('a.csv'));

        return resolve(...args);
    });
    const result = await listTool(vault.config, {
        includeAttachments: true,
        limit: 2,
    });

    expect(result).toMatchObject({
        total: 3,
        nextOffset: 2,
        complete: false,
        entryErrors: [
            {
                path: 'a.csv',
                message: expect.any(String),
            },
        ],
    });
    expect(result.entries.map((entry) => entry.path)).toEqual(['b.csv']);
});

it('reports a hashing read failure without losing other entries', async () => {
    vault = await createTestVault({
        'a.csv': 'a',
        'b.csv': 'b',
    });
    vi.spyOn(vaultFiles, 'readFileBytes').mockRejectedValueOnce(new Error('Permission denied'));
    const result = await listTool(vault.config, {
        includeAttachments: true,
        recursive: true,
    });

    expect(result.complete).toBe(false);
    expect(result.entryErrors).toEqual([
        {
            path: 'a.csv',
            message: 'Permission denied',
        },
    ]);
    expect(result.entries.map((entry) => entry.path)).toEqual(['b.csv']);
});

it('propagates cancellation during hashing rather than reporting an entry error', async () => {
    vault = await createTestVault({
        'a.csv': 'a',
        'b.csv': 'b',
    });
    const abort = new AbortController();

    vi.spyOn(vaultFiles, 'readFileBytes').mockImplementationOnce(async () => {
        await Promise.resolve();
        abort.abort(new Error('cancelled'));
        abort.signal.throwIfAborted();

        return Buffer.alloc(0);
    });
    await expect(listTool(vault.config, { includeAttachments: true }, createCommandExecution({ signal: abort.signal })))
        .rejects.toThrow('cancelled');
});
