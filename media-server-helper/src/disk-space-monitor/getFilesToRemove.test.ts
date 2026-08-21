import {
    mkdir, mkdtemp, rm, utimes, writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { getFilesToRemove } from './getFilesToRemove';

let directory: string;

/** Writes a file of an exact size and backdates it, so ordering is deterministic. */
async function createFile({
    relativePath,
    sizeBytes,
    ageDays,
}: {
    relativePath: string;
    sizeBytes: number;
    ageDays: number;
}): Promise<void> {
    const absolutePath = join(directory, relativePath);
    const modifiedAt = new Date(Date.now() - (ageDays * 24 * 60 * 60 * 1000));

    await writeFile(absolutePath, 'x'.repeat(sizeBytes));
    await utimes(absolutePath, modifiedAt, modifiedAt);
}

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'get-files-to-remove-'));
});

afterEach(async () => {
    await rm(directory, {
        recursive: true,
        force: true,
    });
});

describe('getFilesToRemove', () => {
    it('takes the oldest files first and stops as soon as the target is met', async () => {
        await createFile({
            relativePath: 'newest.mkv',
            sizeBytes: 100,
            ageDays: 1,
        });
        await createFile({
            relativePath: 'oldest.mkv',
            sizeBytes: 100,
            ageDays: 30,
        });
        await createFile({
            relativePath: 'middle.mkv',
            sizeBytes: 100,
            ageDays: 10,
        });

        const { filesToRemove, filesToRemoveSizeBytes } = await getFilesToRemove({
            bytesToRemove: 150,
            pathToRemoveFiles: directory,
        });

        // 'middle' is included because the total is still short of 150 after 'oldest';
        // 'newest' is not, because the target is met before it is reached.
        expect(filesToRemove.map((file) => file.name)).toEqual([
            'oldest.mkv',
            'middle.mkv',
        ]);
        expect(filesToRemoveSizeBytes).toBe(200);
    });

    it('finds files inside subdirectories', async () => {
        await mkdir(join(directory, 'nested', 'deeper'), { recursive: true });
        await createFile({
            relativePath: join('nested', 'deeper', 'buried.mkv'),
            sizeBytes: 50,
            ageDays: 5,
        });

        const { filesToRemove } = await getFilesToRemove({
            bytesToRemove: 10,
            pathToRemoveFiles: directory,
        });

        expect(filesToRemove).toHaveLength(1);
        expect(filesToRemove[0]?.name).toBe('buried.mkv');
    });

    it('removes nothing when there is no space to reclaim', async () => {
        await createFile({
            relativePath: 'keep-me.mkv',
            sizeBytes: 100,
            ageDays: 30,
        });

        const { filesToRemove, filesToRemoveSizeBytes } = await getFilesToRemove({
            bytesToRemove: 0,
            pathToRemoveFiles: directory,
        });

        expect(filesToRemove).toEqual([]);
        expect(filesToRemoveSizeBytes).toBe(0);
    });

    it('takes every file when the target exceeds what is available', async () => {
        await createFile({
            relativePath: 'a.mkv',
            sizeBytes: 10,
            ageDays: 2,
        });
        await createFile({
            relativePath: 'b.mkv',
            sizeBytes: 10,
            ageDays: 1,
        });

        const { filesToRemove, filesToRemoveSizeBytes } = await getFilesToRemove({
            bytesToRemove: 10_000,
            pathToRemoveFiles: directory,
        });

        expect(filesToRemove).toHaveLength(2);
        expect(filesToRemoveSizeBytes).toBe(20);
    });
});
