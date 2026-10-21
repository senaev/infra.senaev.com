import {
    open, rename, symlink, unlink,
} from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import {
    downloadTool, downloadChunkTool, readVaultFileResource,
} from './downloadTool';

vi.mock('node:fs/promises', async (original) => {
    const fs = await original<typeof import('node:fs/promises')>();

    return {
        ...fs,
        open: vi.fn(fs.open),
    };
});
let vault: TestVault;

afterEach(async () => {
    vi.mocked(open).mockReset();
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

    vi.mocked(open).mockImplementation(actual.open);
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
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

    vi.mocked(open).mockImplementationOnce(async (path, flags, permissions) => {
        await unlink(vault.path('a.pdf'));
        await symlink(vault.path('.obsidian/private.txt'), vault.path('a.pdf'));

        return actual.open(path, flags, permissions);
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
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

    vi.mocked(open).mockImplementationOnce(async (path, flags, permissions) => {
        await rename(vault.path('files'), vault.path('original-files'));
        await symlink(vault.path('.obsidian'), vault.path('files'));

        return actual.open(path, flags, permissions);
    });
    const run = readMode(mode, ref);

    await expect(run).rejects.toMatchObject({ code: 'forbidden_path' });
});
