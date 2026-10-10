import {
    mkdir, mkdtemp, rm, stat, symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import {
    assertNoSymlinkOnPath, normalizeRootRelativePath, prepareNewFilePath,
} from './rootRelativePath';

describe('normalizeRootRelativePath', () => {
    it('reads a leading slash as the root and drops "./" and trailing slashes', () => {
        expect(normalizeRootRelativePath('/src/a.ts', 'path', 'project')).toBe('src/a.ts');
        expect(normalizeRootRelativePath('./src/', 'path', 'project')).toBe('src');
        expect(normalizeRootRelativePath('', 'path', 'project')).toBe('');
    });

    it('names the root in the error for a path that climbs out of it', () => {
        expect(() => normalizeRootRelativePath('src/../../x', 'path', 'project')).toThrow('"path" points outside the project');
        expect(() => normalizeRootRelativePath('a\\b', 'path', 'project')).toThrow('forbidden character');
    });
});

describe('file system checks', () => {
    let root: string;

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'root-relative-path-'));
        await mkdir(join(root, 'src'));
    });

    afterEach(async () => {
        await rm(root, {
            recursive: true,
            force: true,
        });
    });

    it('returns the absolute path when there is no symlink on the way', async () => {
        await expect(assertNoSymlinkOnPath(root, 'src')).resolves.toBe(join(root, 'src'));
    });

    it('rejects a path through a symlink', async () => {
        await symlink(join(root, 'src'), join(root, 'link'));

        await expect(assertNoSymlinkOnPath(root, 'link')).rejects.toMatchObject({ code: 'forbidden_path' });
    });

    it('creates the missing folders for a new file', async () => {
        await expect(prepareNewFilePath(root, 'src/a/b/c.ts')).resolves.toBe(join(root, 'src/a/b/c.ts'));
        expect((await stat(join(root, 'src/a/b'))).isDirectory()).toBe(true);
    });

    it('does not create folders below a symlinked folder', async () => {
        await symlink(join(root, 'src'), join(root, 'link'));

        await expect(prepareNewFilePath(root, 'link/new/c.ts')).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});
