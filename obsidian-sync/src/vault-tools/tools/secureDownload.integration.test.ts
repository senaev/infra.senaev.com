import {
    open, utimes, writeFile,
} from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';

import { createTestVault, type TestVault } from '../createTestVault';

import { downloadTool } from './downloadTool';

vi.mock('node:fs/promises', async (original) => {
    const fs = await original<typeof import('node:fs/promises')>();

    return {
        ...fs,
        open: vi.fn(fs.open),
    };
});
let vault: TestVault;

afterEach(async () => {
    await vault?.remove();
});

it('rejects an in-place same-size change detected after hashing', async () => {
    vault = await createTestVault({ 'a.pdf': 'ordinary' });
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

    vi.mocked(open).mockImplementationOnce(async (...args) => {
        const handle = await actual.open(...args);
        const read = handle.read.bind(handle);

        vi.spyOn(handle, 'read').mockImplementationOnce(async (...readArgs: Parameters<typeof read>) => {
            await writeFile(vault.path('a.pdf'), 'modified');
            // Filesystem clocks can give rapid writes identical timestamps. Make the
            // simulated version change explicit without sleeping for another tick.
            await utimes(vault.path('a.pdf'), new Date(0), new Date(0));

            return await read(...readArgs);
        });

        return handle;
    });
    await expect(downloadTool(vault.config, { path: 'a.pdf' })).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'version_changed' },
    });
});
