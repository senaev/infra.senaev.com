import {
    mkdir, mkdtemp, rm, symlink, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, beforeEach, describe, expect, test,
} from 'vitest';

import { walkDirectory } from './walkDirectory';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'walk-directory-'));
    await mkdir(join(root, 'a/b'), { recursive: true });
    await mkdir(join(root, 'skip'));
    await writeFile(join(root, 'top.md'), '');
    await writeFile(join(root, 'a/one.md'), '');
    await writeFile(join(root, 'a/b/two.txt'), '');
    await writeFile(join(root, 'skip/hidden.md'), '');
    await symlink(join(root, 'a'), join(root, 'link-to-a'));
    await symlink(join(root, 'top.md'), join(root, 'link.md'));
});

afterEach(async () => {
    await rm(root, {
        recursive: true,
        force: true,
    });
});

describe('walkDirectory', () => {
    test('returns every file at any depth as root-relative paths, and never follows symlinks', async () => {
        const { files, errors } = await walkDirectory(root);

        expect(files.sort()).toEqual([
            'a/b/two.txt',
            'a/one.md',
            'skip/hidden.md',
            'top.md',
        ]);
        expect(errors).toEqual([]);
    });

    test('applies the folder and file filters, and can start below the root', async () => {
        const filtered = await walkDirectory(root, '', {
            includeFolder: (path) => path !== 'skip',
            includeFile: (path) => path.endsWith('.md'),
        });
        const below = await walkDirectory(root, 'a');

        expect(filtered.files.sort()).toEqual([
            'a/one.md',
            'top.md',
        ]);
        expect(below.files.sort()).toEqual([
            'a/b/two.txt',
            'a/one.md',
        ]);
    });

    test('reports a folder that cannot be read and goes on', async () => {
        const { files, errors } = await walkDirectory(root, 'missing');

        expect(files).toEqual([]);
        expect(errors.map((error) => error.path)).toEqual(['missing']);
    });
});
