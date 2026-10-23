import { createHash } from 'node:crypto';
import {
    symlink, truncate, writeFile,
} from 'node:fs/promises';

import {
    afterEach, expect, it, vi,
} from 'vitest';
import * as secure from 'senaev-utils/src/files/secureFilesystem/runSecureFilesystem';
import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';

import { createTestVault, type TestVault } from '../createTestVault';
import { MAX_FILE_BYTES } from '../access/vaultFiles';

import {
    downloadTool, downloadChunkTool, DOWNLOAD_CHUNK_BYTES,
} from './downloadTool';

let vault: TestVault;

afterEach(() => vault?.remove());

it.each([
    0,
    1,
    DOWNLOAD_CHUNK_BYTES - 1,
    DOWNLOAD_CHUNK_BYTES,
    DOWNLOAD_CHUNK_BYTES + 1,
    65536 + 71,
])('reconstructs all %i bytes and advertises metadata without file contents', async (size) => {
    vault = await createTestVault({ 'files/a.PDF': '' });
    const original = Buffer.from(Array.from({ length: size }, (_, i) => (i + Math.floor(i / 65536)) % 256));

    await writeFile(vault.path('files/a.PDF'), original);
    const metadata = await downloadTool(vault.config, { path: 'files/a.PDF' });
    const hash = createHash('sha256').update(original).digest('hex');

    expect(metadata).toMatchObject({
        path: 'files/a.PDF',
        name: 'a.PDF',
        mimeType: 'application/pdf',
        size,
        hash,
        chunkSize: DOWNLOAD_CHUNK_BYTES,
        chunkCount: Math.max(1, Math.ceil(size / DOWNLOAD_CHUNK_BYTES)),
    });
    expect(metadata).not.toHaveProperty('data');
    expect(metadata).not.toHaveProperty('bytes');
    const parts: Buffer[] = [];

    for (let chunkIndex = 0; chunkIndex < metadata.chunkCount; chunkIndex++) {
        const result = await downloadChunkTool(vault.config, {
            path: metadata.path,
            expectedHash: hash,
            chunkIndex,
        });
        const decoded = Buffer.from(result.data, 'base64');

        expect(result).toMatchObject({
            hash,
            size,
            chunkIndex,
            chunkCount: metadata.chunkCount,
            offset: chunkIndex * DOWNLOAD_CHUNK_BYTES,
            byteCount: decoded.length,
            encoding: 'base64',
            isLast: chunkIndex === metadata.chunkCount - 1,
        });
        expect(decoded.length).toBeLessThanOrEqual(DOWNLOAD_CHUNK_BYTES);
        expect(JSON.stringify(result).length).toBeLessThan(30000);
        parts.push(decoded);
    }

    expect(Buffer.concat(parts)).toEqual(original);
    expect(createHash('sha256').update(Buffer.concat(parts)).digest('hex')).toBe(hash);
    await expect(downloadChunkTool(vault.config, {
        path: metadata.path,
        expectedHash: hash,
        chunkIndex: metadata.chunkCount,
    })).rejects.toMatchObject({ code: 'invalid_arguments' });
});

it('rejects changed bytes even when size and the requested chunk are unchanged', async () => {
    vault = await createTestVault({ 'a.bin': '' });
    const bytes = Buffer.alloc(DOWNLOAD_CHUNK_BYTES + 1, 65);

    await writeFile(vault.path('a.bin'), bytes);
    const metadata = await downloadTool(vault.config, { path: 'a.bin' });

    bytes[bytes.length - 1] = 66;
    await writeFile(vault.path('a.bin'), bytes);
    await expect(downloadChunkTool(vault.config, {
        path: 'a.bin',
        expectedHash: metadata.hash,
        chunkIndex: 0,
    })).rejects.toMatchObject({
        code: 'conflict',
        details: {
            reason: 'version_changed',
            retryable: false,
        },
    });
});

it.each([
    -1,
    0.5,
    '0',
    null,
    undefined,
    Infinity,
    Number.MAX_SAFE_INTEGER,
])('rejects invalid chunk index %s', async (chunkIndex) => {
    vault = await createTestVault({});
    await expect(downloadChunkTool(vault.config, {
        path: 'a.bin',
        expectedHash: 'a'.repeat(64),
        chunkIndex,
    })).rejects.toMatchObject({ code: 'invalid_arguments' });
});

it.each([
    '',
    'a'.repeat(63),
    'A'.repeat(64),
    'z'.repeat(64),
])('rejects invalid hashes', async (expectedHash) => {
    vault = await createTestVault({});
    await expect(downloadChunkTool(vault.config, {
        path: 'a.bin',
        expectedHash,
        chunkIndex: 0,
    })).rejects.toMatchObject({ code: 'invalid_arguments' });
});

it('rejects excluded, traversing, symbolic, missing and oversized files', async () => {
    vault = await createTestVault({ 'a.bin': '' });
    const args = {
        expectedHash: 'a'.repeat(64),
        chunkIndex: 0,
    };

    for (const path of [
        '../a.bin',
        '.obsidian/a.bin',
        'plugins/a.bin',
    ]) {
        await expect(downloadChunkTool(vault.config, {
            ...args,
            path,
        })).rejects.toMatchObject({ code: 'forbidden_path' });
    }

    await symlink(vault.path('a.bin'), vault.path('alias.bin'));
    await expect(downloadChunkTool(vault.config, {
        ...args,
        path: 'alias.bin',
    })).rejects.toMatchObject({ code: 'forbidden_path' });
    await expect(downloadChunkTool(vault.config, {
        ...args,
        path: 'missing.bin',
    })).rejects.toMatchObject({ code: 'not_found' });
    await truncate(vault.path('a.bin'), MAX_FILE_BYTES + 1);
    await expect(downloadChunkTool(vault.config, {
        ...args,
        path: 'a.bin',
    })).rejects.toMatchObject({ code: 'file_too_large' });
});

it('honours cancellation while hashing before returning bytes', async () => {
    vault = await createTestVault({ 'a.bin': '' });
    await writeFile(vault.path('a.bin'), Buffer.alloc(128000));
    const metadata = await downloadTool(vault.config, { path: 'a.bin' });
    const abort = new AbortController();
    const execution = createCommandExecution({ signal: abort.signal });
    const runSecure = secure.runSecureFilesystem;

    vi.spyOn(secure, 'runSecureFilesystem').mockImplementationOnce(async (...args) => {
        // Start the actual secure reader, then cancel before it can return bytes.
        const pending = runSecure(...args);

        abort.abort();

        return await pending;
    });

    await expect(downloadChunkTool(vault.config, {
        path: 'a.bin',
        expectedHash: metadata.hash,
        chunkIndex: 0,
    }, execution)).rejects.toThrow();
    expect((await downloadTool(vault.config, { path: 'a.bin' })).hash).toBe(metadata.hash);
});

it('accepts the final partial chunk at the maximum file size', async () => {
    vault = await createTestVault({ 'max.bin': '' });
    await truncate(vault.path('max.bin'), MAX_FILE_BYTES);
    const metadata = await downloadTool(vault.config, { path: 'max.bin' });
    const last = await downloadChunkTool(vault.config, {
        path: 'max.bin',
        expectedHash: metadata.hash,
        chunkIndex: metadata.chunkCount - 1,
    });

    expect(last.byteCount).toBe(MAX_FILE_BYTES - last.offset);
    expect(Buffer.from(last.data, 'base64')).toEqual(Buffer.alloc(last.byteCount));
    expect(last.isLast).toBe(true);
});

it('bounds parallel hashing and releases admission after completion', async () => {
    vault = await createTestVault({ 'a.bin': 'content' });
    let release!: () => void;
    let entered!: () => void;
    let count = 0;
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const paused = () => {
        const execution = createCommandExecution();
        const checkpoint = execution.checkpoint.bind(execution);
        let first = true;

        execution.checkpoint = async () => {
            if (first) {
                first = false;
                if (++count === 2) {
                    entered();
                }

                await barrier;
            }

            await checkpoint();
        };

        return execution;
    };
    const requests = [
        downloadTool(vault.config, { path: 'a.bin' }, paused()),
        downloadTool(vault.config, { path: 'a.bin' }, paused()),
    ];

    try {
        await started;
        await expect(downloadTool(vault.config, { path: 'a.bin' })).rejects.toMatchObject({
            code: 'conflict',
            details: {
                reason: 'download_capacity',
                retryable: true,
            },
        });
        release();
        await Promise.all(requests);
        expect((await downloadTool(vault.config, { path: 'a.bin' })).size).toBe(7);
    } finally {
        release();
        await Promise.allSettled(requests);
    }
});
