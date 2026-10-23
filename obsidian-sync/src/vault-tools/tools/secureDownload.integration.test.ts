import {
    rename, symlink, unlink,
} from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import * as secure from 'senaev-utils/src/files/secureFilesystem/runSecureFilesystem';

import { createTestVault, type TestVault } from '../createTestVault';

import {
    downloadTool, downloadChunkTool, readVaultFileResource,
} from './downloadTool';

let vault: TestVault;

afterEach(async () => {
    vi.restoreAllMocks();
    await vault?.remove();
});

function readMode(mode: string, ref: Awaited<ReturnType<typeof downloadTool>>) {
    if (mode === 'metadata') {
        return downloadTool(vault.config, { path: ref.path });
    }

    if (mode === 'chunk') {
        return downloadChunkTool(vault.config, {
            path: ref.path,
            expectedHash: ref.hash,
            chunkIndex: 0,
        });
    }

    return readVaultFileResource(vault.config, { uri: ref.resource.uri });
}

it.each([
    'metadata',
    'resource',
    'chunk',
])('blocks leaf replacement after validation for %s reads', async (mode) => {
    vault = await createTestVault({
        'a.pdf': 'ordinary',
        '.obsidian/private.txt': 'PRIVATE-FIXTURE',
    });
    const ref = await downloadTool(vault.config, { path: 'a.pdf' });
    const runSecure = secure.runSecureFilesystem;

    vi.spyOn(secure, 'runSecureFilesystem').mockImplementationOnce(async (...args) => {
        await unlink(vault.path('a.pdf'));
        await symlink(vault.path('.obsidian/private.txt'), vault.path('a.pdf'));

        return await runSecure(...args);
    });
    const run = readMode(mode, ref);

    await expect(run).rejects.toMatchObject({ code: 'forbidden_path' });
});

it.each([
    'metadata',
    'resource',
    'chunk',
])('blocks parent-directory replacement after validation for %s reads', async (mode) => {
    vault = await createTestVault({
        'files/a.pdf': 'ordinary',
        '.obsidian/a.pdf': 'PRIVATE-FIXTURE',
    });
    const ref = await downloadTool(vault.config, { path: 'files/a.pdf' });
    const runSecure = secure.runSecureFilesystem;

    vi.spyOn(secure, 'runSecureFilesystem').mockImplementationOnce(async (...args) => {
        await rename(vault.path('files'), vault.path('original-files'));
        await symlink(vault.path('.obsidian'), vault.path('files'));

        return await runSecure(...args);
    });
    const run = readMode(mode, ref);

    await expect(run).rejects.toMatchObject({ code: 'forbidden_path' });
});

it('releases read admission when the secure reader fails', async () => {
    vault = await createTestVault({ 'a.pdf': 'ordinary' });
    vi.spyOn(secure, 'runSecureFilesystem').mockRejectedValue(new Error('reader unavailable'));
    for (let attempt = 0; attempt < 3; attempt++) {
        await expect(downloadTool(vault.config, { path: 'a.pdf' })).rejects.toThrow('reader unavailable');
    }

    vi.restoreAllMocks();
    expect((await downloadTool(vault.config, { path: 'a.pdf' })).size).toBe(8);
});
