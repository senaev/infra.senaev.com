import {
    mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

import { createCommandExecution } from '../commands/CommandExecution';
import { walkDirectory } from '../utils/fs/walkDirectory/walkDirectory';
import { createFileExclusively, replaceFileAtomically } from '../utils/fs/atomicFileWrite/atomicFileWrite';

import { createFileDiffAsync } from './createFileDiffAsync';
import { readOperationTextFile } from './readOperationTextFile';
import { prepareNewFilePath } from './rootRelativePath';
import { replaceExactlyOnceAsync } from './textEdits';
import { withFileMutation } from './withFileMutation';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explicit-file-execution-'));
});
afterEach(async () => {
    await rm(root, {
        recursive: true,
        force: true,
    });
});

describe('explicit file execution capabilities', () => {
    it('reads, edits, computes a worker diff and publishes using only explicit capabilities', async () => {
        const file = join(root, 'sample.md');
        const ownChanges = new Set<string>();
        const execution = createCommandExecution({ changedPath: (path) => ownChanges.add(path) });

        await writeFile(file, 'before');
        const result = await withFileMutation(file, async () => {
            const before = await readOperationTextFile(file, execution);
            const after = await replaceExactlyOnceAsync(before, 'before', 'after', { execution });
            const diff = await createFileDiffAsync('sample.md', before, after, execution);

            await replaceFileAtomically(file, after, execution.signal, () => execution.changedPath('sample.md'));

            return diff;
        }, execution);

        expect(await readFile(file, 'utf8')).toBe('after');
        expect(result.diff).toContain('+after');
        expect([...ownChanges]).toEqual(['sample.md']);
        const newPath = await prepareNewFilePath(root, 'new/child.md', execution);

        expect(newPath).toBe(join(root, 'new/child.md'));
        expect(ownChanges.has('new')).toBe(true);
        await createFileExclusively(newPath, 'created', execution.signal, () => execution.changedPath('new/child.md'));
        await expect(createFileExclusively(file, 'overwrite', execution.signal)).rejects.toMatchObject({ code: 'EEXIST' });
        expect(await readFile(file, 'utf8')).toBe('after');
        const walk = await walkDirectory(root, '', {}, execution);

        expect(walk.files.sort()).toEqual([
            'new/child.md',
            'sample.md',
        ]);
        expect(walk.errors).toEqual([]);
    });

    it('rejects pre-aborted work without invoking a mutation handler or reserving its path', async () => {
        const controller = new AbortController();
        const reason = Object.assign(new Error('cancelled'), { code: 'ENOENT' });
        const run = vi.fn(() => Promise.resolve('unexpected'));

        controller.abort(reason);
        const execution = createCommandExecution({ signal: controller.signal });

        await expect(readOperationTextFile(join(root, 'missing'), execution)).rejects.toBe(reason);
        await expect(replaceExactlyOnceAsync('text', 'missing', 'new', { execution })).rejects.toBe(reason);
        await expect(createFileDiffAsync('note', 'old', 'new', execution)).rejects.toBe(reason);
        await expect(withFileMutation('reserved', run, execution)).rejects.toBe(reason);
        expect(run).not.toHaveBeenCalled();
        expect(await withFileMutation('reserved', () => Promise.resolve('available'), createCommandExecution())).toBe('available');
    });

    it('releases reservations after cancellation of a running handler', async () => {
        const controller = new AbortController();
        const reason = new Error('cancel active mutation');
        let started = () => {};
        const ready = new Promise<void>((resolve) => {
            started = resolve;
        });
        const execution = createCommandExecution({ signal: controller.signal });
        const running = withFileMutation('active', async () => {
            started();
            await new Promise<void>((resolve) => execution.signal.addEventListener('abort', () => resolve(), { once: true }));
            execution.throwIfAborted();
        }, execution);
        const observed = running.catch((error: unknown) => error);

        try {
            await ready;
            controller.abort(reason);
            expect(await observed).toBe(reason);
            expect(await withFileMutation('active', () => Promise.resolve('released'), createCommandExecution())).toBe('released');
        } finally {
            controller.abort(reason);
            await observed;
        }
    });
});
