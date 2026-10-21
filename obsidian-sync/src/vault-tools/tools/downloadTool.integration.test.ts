import {
    symlink, truncate, writeFile,
} from 'node:fs/promises';

import {
    afterEach, expect, it,
} from 'vitest';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';
import { MAX_FILE_BYTES } from '../access/vaultFiles';

import { downloadTool, readVaultFileResource } from './downloadTool';

let vault: TestVault;

afterEach(async () => {
    await vault?.remove();
});

it('downloads original PDF bytes and rejects a changed version', async () => {
    vault = await createTestVault({ 'payslips/a b.pdf': '' });
    const bytes = Buffer.from([
        0,
        255,
        128,
        10,
    ]);

    await writeFile(vault.path('payslips/a b.pdf'), bytes);
    const result = await downloadTool(vault.config, { path: 'payslips/a b.pdf' });

    expect(result.resource).toMatchObject({
        type: 'resource_link',
        name: 'a b.pdf',
        mimeType: 'application/pdf',
        size: 4,
    });
    expect(JSON.stringify(result)).not.toContain('blob');
    const read = await readVaultFileResource(vault.config, { uri: result.resource.uri });

    expect(Buffer.from(read.contents[0]?.blob ?? '', 'base64')).toEqual(bytes);
    await writeFile(vault.path('payslips/a b.pdf'), 'changed');
    await expect(readVaultFileResource(vault.config, { uri: result.resource.uri })).rejects.toMatchObject({ code: 'conflict' });
});

it.each([
    '../escape.pdf',
    '.obsidian/private.pdf',
    'plugins/a.pdf',
])('rejects forbidden download path %s', async (path) => {
    vault = await createTestVault({});
    await expect(downloadTool(vault.config, { path })).rejects.toMatchObject({ code: 'forbidden_path' });
});

it('rejects symlinks, missing files, oversized data and cancellation', async () => {
    vault = await createTestVault({ 'a.pdf': '' });
    await symlink(vault.path('a.pdf'), vault.path('alias.pdf'));
    await expect(downloadTool(vault.config, { path: 'alias.pdf' })).rejects.toMatchObject({ code: 'forbidden_path' });
    await expect(downloadTool(vault.config, { path: 'missing.pdf' })).rejects.toMatchObject({ code: 'not_found' });
    const result = await downloadTool(vault.config, { path: 'a.pdf' });

    await truncate(vault.path('a.pdf'), MAX_FILE_BYTES + 1);
    await expect(downloadTool(vault.config, { path: 'a.pdf' })).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(readVaultFileResource(vault.config, { uri: result.resource.uri })).rejects.toMatchObject({ code: 'file_too_large' });
    const abort = new AbortController();

    abort.abort();
    await expect(downloadTool(vault.config, { path: 'a.pdf' }, createCommandExecution({ signal: abort.signal }))).rejects.toThrow();
});

it.each([
    'https://example.com/a.pdf',
    `obsidian-vault://file/%ZZ?sha256=${'a'.repeat(64)}`,
])('rejects invalid resource URI %s', async (uri) => {
    vault = await createTestVault({});
    await expect(readVaultFileResource(vault.config, { uri })).rejects.toMatchObject({ code: 'invalid_arguments' });
});
