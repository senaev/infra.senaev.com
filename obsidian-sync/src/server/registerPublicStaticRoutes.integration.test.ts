import {
    mkdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
    afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';

import { PUBLIC_STATIC_DIR } from '../vaultPaths';

import { createVaultServer, type VaultServer } from './createVaultServer';
import { registerPublicStaticRoutes } from './registerPublicStaticRoutes';

vi.mock('../vaultPaths', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const vault = fs.realpathSync(fs.mkdtempSync(`${os.tmpdir()}/public-static-test-`));

    return { PUBLIC_STATIC_DIR: `${vault}/public-static` };
});

const paths = {
    vault: dirname(PUBLIC_STATIC_DIR),
    publicStatic: PUBLIC_STATIC_DIR,
};

let server: VaultServer;

beforeAll(async () => {
    mkdirSync(join(paths.publicStatic, 'folder'), { recursive: true });
    writeFileSync(join(paths.publicStatic, 'page.html'), 'public page');
    mkdirSync(join(paths.vault, 'public-static-private'));
    writeFileSync(join(paths.vault, 'public-static-private', 'secret.txt'), 'private secret');
    writeFileSync(join(paths.vault, 'note.md'), 'private note');
    symlinkSync(join(paths.vault, 'public-static-private', 'secret.txt'), join(paths.publicStatic, 'sibling.txt'));
    symlinkSync(join(paths.vault, 'note.md'), join(paths.publicStatic, 'note.txt'));
    symlinkSync(join(paths.publicStatic, 'page.html'), join(paths.publicStatic, 'folder', 'inside.html'));

    server = createVaultServer();
    registerPublicStaticRoutes(server);
    await server.ready();
});

afterAll(async () => {
    await server.close();
    rmSync(paths.vault, {
        recursive: true,
        force: true,
    });
});

function get(path: string) {
    return server.inject({
        method: 'GET',
        url: `/public-static/${path}`,
    });
}

describe('public static routes', () => {
    it('serves a file under the root, also through a symlink that stays inside it', async () => {
        expect((await get('page.html')).body).toBe('public page');
        expect((await get('folder/inside.html')).body).toBe('public page');
    });

    it.each([
        'sibling.txt',
        'note.txt',
    ])('refuses the symlink %s that points out of the root', async (path) => {
        const response = await get(path);

        expect(response.statusCode).not.toBe(200);
        expect(response.body).not.toContain('private');
    });
});
