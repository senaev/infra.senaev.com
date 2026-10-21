import {
    open, realpath, rename, symlink, unlink, writeFile,
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
        realpath: vi.fn(fs.realpath),
    };
});
let vault: TestVault;

afterEach(async () => {
    vi.mocked(open).mockReset();
    vi.mocked(realpath).mockReset();
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

    vi.mocked(open).mockImplementation(actual.open);
    vi.mocked(realpath).mockImplementation(actual.realpath);
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

it('fails closed without procfs and releases the file read slot', async () => {
    vault = await createTestVault({ 'a.pdf': 'ordinary' });
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

    vi.mocked(realpath).mockImplementation(async (path, options) => {
        if (String(path).startsWith('/proc/self/fd/')) {
            throw new Error('procfs unavailable');
        }

        return await actual.realpath(path, options);
    });
    for (let attempt = 0; attempt < 3; attempt++) {
        await expect(downloadTool(vault.config, { path: 'a.pdf' })).rejects.toMatchObject({ code: 'command_failed' });
    }

    vi.mocked(realpath).mockImplementation(actual.realpath);
    expect((await downloadTool(vault.config, { path: 'a.pdf' })).size).toBe(8);
});

it('rejects an in-place same-size change detected after hashing', async () => {
    vault = await createTestVault({ 'a.pdf': 'ordinary' });
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    let descriptorChecks = 0;

    vi.mocked(realpath).mockImplementation(async (path, options) => {
        if (String(path).startsWith('/proc/self/fd/') && ++descriptorChecks === 2) {
            await writeFile(vault.path('a.pdf'), 'modified');
        }

        return await actual.realpath(path, options);
    });
    await expect(downloadTool(vault.config, { path: 'a.pdf' })).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'version_changed' },
    });
});
