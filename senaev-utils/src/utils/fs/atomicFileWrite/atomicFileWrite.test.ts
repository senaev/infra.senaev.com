import {
    mkdtemp, readdir, readFile, rm, stat, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, beforeEach, describe, expect, test,
} from 'vitest';

import { isAlreadyExistsError } from '../../Error/isAlreadyExistsError/isAlreadyExistsError';

import { createFileExclusively, replaceFileAtomically } from './atomicFileWrite';

let folder: string;

beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'atomic-file-write-'));
});

afterEach(async () => {
    await rm(folder, {
        recursive: true,
        force: true,
    });
});

describe('replaceFileAtomically', () => {
    test('replaces the content and leaves no temporary file', async () => {
        const path = join(folder, 'note.md');

        await writeFile(path, 'old');
        await replaceFileAtomically(path, 'new');

        expect(await readFile(path, 'utf8')).toBe('new');
        expect(await readdir(folder)).toEqual(['note.md']);
    });

    test('keeps the permission bits, so a script stays executable', async () => {
        const path = join(folder, 'run.sh');

        await writeFile(path, 'old', { mode: 0o755 });
        await replaceFileAtomically(path, 'new');

        expect((await stat(path)).mode & 0o777).toBe(0o755);
    });
});

describe('createFileExclusively', () => {
    test('creates a new file and leaves no temporary file', async () => {
        const path = join(folder, 'note.md');

        await createFileExclusively(path, 'content');

        expect(await readFile(path, 'utf8')).toBe('content');
        expect(await readdir(folder)).toEqual(['note.md']);
    });

    test('fails with EEXIST and keeps an existing file unchanged', async () => {
        const path = join(folder, 'note.md');

        await writeFile(path, 'existing');

        const error: unknown = await createFileExclusively(path, 'new').catch((caught: unknown) => caught);

        expect(isAlreadyExistsError(error)).toBe(true);
        expect(await readFile(path, 'utf8')).toBe('existing');
        expect(await readdir(folder)).toEqual(['note.md']);
    });
});
