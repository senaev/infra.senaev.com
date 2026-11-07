import {
    mkdir, mkdtemp, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, beforeEach, expect, it,
} from 'vitest';

import {
    OVERSIZE_THRESHOLD_BYTES, renderVaultMetrics, scanVaultInventory,
} from './vaultInventory';

let root: string;
let external: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'vault-file-inventory-'));
    external = await mkdtemp(join(tmpdir(), 'vault-inventory-outside-'));
});

afterEach(async () => {
    await Promise.all([
        rm(root, {
            recursive: true,
            force: true,
        }),
        rm(external, {
            recursive: true,
            force: true,
        }),
    ]);
});

it('counts content and attachments by type and byte size, including the largest file path', async () => {
    await mkdir(join(root, 'notes'), { recursive: true });
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'notes', 'a.md'), 'hello');
    await writeFile(join(root, 'notes', 'b.MD'), 'world');
    await writeFile(join(root, 'assets', '2026.csv'), 'id,name\n1,a\n');
    await writeFile(join(root, 'assets', 'photo.webp'), Buffer.alloc(32));
    await writeFile(join(root, 'no-extension'), Buffer.alloc(7));
    await writeFile(join(root, 'unknown.zzzx'), Buffer.alloc(9));

    const result = await scanVaultInventory(root);

    expect(result.totalFiles).toBe(6);
    expect(result.totalBytes).toBe(5 + 5 + 12 + 32 + 7 + 9);
    expect(result.byType).toEqual({
        md: {
            files: 2,
            bytes: 10,
        },
        csv: {
            files: 1,
            bytes: 12,
        },
        webp: {
            files: 1,
            bytes: 32,
        },
        no_extension: {
            files: 1,
            bytes: 7,
        },
        other: {
            files: 1,
            bytes: 9,
        },
    });
    expect(result.largest).toEqual({
        path: 'assets/photo.webp',
        bytes: 32,
        type: 'webp',
    });
    expect(result.largestFiles).toHaveLength(6);
    expect(result.oversizedFiles).toBe(0);
    expect(renderVaultMetrics(result)).toContain('obsidian_vault_largest_file_bytes{path="assets/photo.webp",type="webp"} 32');
});

it('ignores hidden folders, trash, dependencies, hidden files, and symlinks outside the vault', async () => {
    await mkdir(join(root, '.trash'), { recursive: true });
    await mkdir(join(root, '.obsidian'), { recursive: true });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await mkdir(join(root, 'plugins'), { recursive: true });
    await mkdir(join(root, 'normal'), { recursive: true });

    for (const folder of [
        '.trash',
        '.obsidian',
        'node_modules',
        'plugins',
    ]) {
        await writeFile(join(root, folder, 'ignored.csv'), Buffer.alloc(500));
    }

    await writeFile(join(root, '.hidden.csv'), Buffer.alloc(500));
    await writeFile(join(root, 'normal', 'included.pdf'), 'pdf');
    await writeFile(join(external, 'private.pdf'), Buffer.alloc(600));
    await symlink(join(external, 'private.pdf'), join(root, 'external.pdf'));
    await symlink(external, join(root, 'outside-folder'));

    const result = await scanVaultInventory(root);

    expect(result.totalFiles).toBe(1);
    expect(result.totalBytes).toBe(3);
    expect(result.largest?.path).toBe('normal/included.pdf');
});

it('detects the exact early-warning threshold and escapes metric label values', async () => {
    const name = 'a"\\\n.csv';

    await writeFile(join(root, name), Buffer.alloc(OVERSIZE_THRESHOLD_BYTES + 1));
    await writeFile(join(root, 'below.csv'), Buffer.alloc(OVERSIZE_THRESHOLD_BYTES));

    const result = await scanVaultInventory(root);

    expect(result.oversizedFiles).toBe(1);
    expect(result.largest?.bytes).toBe(4_500_001);
    expect(renderVaultMetrics(result)).toContain('obsidian_vault_largest_file_bytes{path="a\\"\\\\\\n.csv",type="csv"} 4500001');
    expect(renderVaultMetrics(result)).toContain('obsidian_vault_oversized_files 1');
});

it('bounds the largest-file list to ten and refuses invalid roots', async () => {
    for (let i = 0; i < 15; i++) {
        await writeFile(join(root, `${i}.csv`), Buffer.alloc(i));
    }

    const result = await scanVaultInventory(root);

    expect(result.totalFiles).toBe(15);
    expect(result.largestFiles).toHaveLength(10);
    expect(result.largest?.bytes).toBe(14);
    await expect(scanVaultInventory(join(root, 'missing'))).rejects.toThrow();
});

it('returns no fake largest-file metric for an empty vault', async () => {
    const result = await scanVaultInventory(root);

    expect(result.largest).toBeNull();
    expect(result.totalFiles).toBe(0);
    expect(renderVaultMetrics(result)).not.toMatch(/^obsidian_vault_largest_file_bytes\{/mu);
});
