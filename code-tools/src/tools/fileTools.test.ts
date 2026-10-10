import {
    readFile, stat, symlink, writeFile,
} from 'node:fs/promises';

import { hashContent } from 'senaev-utils/src/toolServer/contentHash';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { listTool } from './listTool';
import { patchTool } from './patchTool';
import { readTool, sliceLines } from './readTool';
import { writeTool } from './writeTool';

let projects: TestProjects;

beforeEach(async () => {
    projects = await createTestProjects({
        demo: {
            '.gitignore': 'dist/\n',
            '.github/workflows/ci.yml': 'on: push\n',
            'README.md': '# Demo\n',
            'src/a.ts': 'export const a = 1;\nexport const b = 2;\n',
            'src/lib/c.ts': 'export const c = 3;\n',
            'dist/a.js': 'built\n',
        },
    });
});

afterEach(async () => {
    await projects.remove();
});

async function readHash(path: string): Promise<string> {
    return hashContent(await readFile(projects.path('demo', path), 'utf8'));
}

describe('listTool', () => {
    it('lists one level, folders first, without ignored files and .git', async () => {
        const result = await listTool(projects.config, { project: 'demo' });

        expect(result.entries.map((entry) => entry.path)).toEqual([
            '.github',
            'src',
            '.gitignore',
            'README.md',
        ]);
    });

    it('lists files at any depth with "recursive" or "glob", and shows new untracked files', async () => {
        await writeFile(projects.path('demo', 'src/new.ts'), '');

        const recursive = await listTool(projects.config, {
            project: 'demo',
            folder: 'src',
            recursive: true,
        });
        const globbed = await listTool(projects.config, {
            project: 'demo',
            glob: 'c.ts',
        });

        expect(recursive.entries).toEqual([
            {
                path: 'src/a.ts',
                type: 'file',
                size: 40,
            },
            {
                path: 'src/lib/c.ts',
                type: 'file',
                size: 20,
            },
            {
                path: 'src/new.ts',
                type: 'file',
                size: 0,
            },
        ]);
        expect(globbed.entries.map((entry) => entry.path)).toEqual(['src/lib/c.ts']);
    });

    it('pages the entries', async () => {
        const result = await listTool(projects.config, {
            project: 'demo',
            recursive: true,
            limit: 2,
            offset: 1,
        });

        expect(result).toMatchObject({
            total: 5,
            nextOffset: 3,
        });
        expect(result.entries.map((entry) => entry.path)).toEqual([
            '.gitignore',
            'README.md',
        ]);
    });
});

describe('sliceLines', () => {
    const content = 'one\ntwo\nthree\n';

    it('returns whole lines from a start line', () => {
        expect(sliceLines(content, {
            startLine: 2,
            lineCount: 1,
        }, 100)).toEqual({
            totalLines: 3,
            startLine: 2,
            endLine: 2,
            content: 'two\n',
            truncated: false,
            nextStartLine: 3,
        });
    });

    it('stops before the line that does not fit, and cuts a single line that alone is too long', () => {
        expect(sliceLines(content, {
            startLine: 1,
            lineCount: 10,
        }, 9)).toMatchObject({
            content: 'one\ntwo\n',
            endLine: 2,
            nextStartLine: 3,
        });
        expect(sliceLines(content, {
            startLine: 3,
            lineCount: 10,
        }, 2)).toMatchObject({
            content: 'th',
            endLine: 3,
            truncated: true,
        });
    });

    it('reads an empty file and a file without a final newline', () => {
        expect(sliceLines('', {
            startLine: 1,
            lineCount: 10,
        }, 100)).toMatchObject({
            totalLines: 0,
            content: '',
            truncated: false,
        });
        expect(sliceLines('a\nb', {
            startLine: 2,
            lineCount: 10,
        }, 100)).toMatchObject({
            totalLines: 2,
            content: 'b',
        });
    });
});

describe('readTool', () => {
    it('reads files with their hash, and reports a bad path without failing the others', async () => {
        const result = await readTool(projects.config, {
            project: 'demo',
            paths: [
                'src/a.ts',
                'missing.ts',
                'README.md',
            ],
        });

        expect(result.files.map((file) => [
            file.path,
            file.content,
        ])).toEqual([
            [
                'src/a.ts',
                'export const a = 1;\nexport const b = 2;\n',
            ],
            [
                'README.md',
                '# Demo\n',
            ],
        ]);
        expect(result.files[0]?.hash).toBe(await readHash('src/a.ts'));
        expect(result.errors).toEqual([
            {
                path: 'missing.ts',
                code: 'not_found',
                message: 'File "missing.ts" does not exist',
            },
        ]);
    });

    it.each([
        '.git/config',
        '../other/x',
        'hosts',
        'image.bin',
    ])('refuses to read %s (.git, outside the project, a symlink, a binary file)', async (path) => {
        await symlink('/etc/hosts', projects.path('demo', 'hosts'));
        await writeFile(projects.path('demo', 'image.bin'), Buffer.from([
            1,
            0,
            2,
        ]));

        await expect(readTool(projects.config, {
            project: 'demo',
            paths: [path],
        })).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});

describe('writeTool', () => {
    it('creates a file with missing folders, and refuses to overwrite it without a hash', async () => {
        const created = await writeTool(projects.config, {
            project: 'demo',
            path: 'src/new/d.ts',
            content: 'export const d = 4;\n',
        });

        expect(created).toMatchObject({
            created: true,
            hash: hashContent('export const d = 4;\n'),
        });
        expect(created.diff).toContain('+export const d = 4;');
        await expect(writeTool(projects.config, {
            project: 'demo',
            path: 'src/new/d.ts',
            content: 'x',
        })).rejects.toMatchObject({ code: 'already_exists' });
    });

    it('replaces a file with the right hash, keeps its mode, and refuses a stale hash', async () => {
        await writeFile(projects.path('demo', 'run.sh'), 'echo 1\n', { mode: 0o755 });

        const hash = await readHash('run.sh');
        const replaced = await writeTool(projects.config, {
            project: 'demo',
            path: 'run.sh',
            content: 'echo 2\n',
            expectedHash: hash,
        });

        expect(replaced).toMatchObject({
            created: false,
            changed: true,
        });
        expect((await stat(projects.path('demo', 'run.sh'))).mode & 0o777).toBe(0o755);
        await expect(writeTool(projects.config, {
            project: 'demo',
            path: 'run.sh',
            content: 'echo 3\n',
            expectedHash: hash,
        })).rejects.toMatchObject({ code: 'conflict' });
    });
});

describe('patchTool', () => {
    it('replaces text and returns a hash that the next patch can use', async () => {
        const first = await patchTool(projects.config, {
            project: 'demo',
            path: 'src/a.ts',
            expectedHash: await readHash('src/a.ts'),
            operations: [
                {
                    find: 'a = 1',
                    replace: 'a = 10',
                },
            ],
        });
        const second = await patchTool(projects.config, {
            project: 'demo',
            path: 'src/a.ts',
            expectedHash: first.hash,
            operations: [
                {
                    find: 'b = 2',
                    replace: 'b = 20',
                },
            ],
        });

        expect(first.diff).toContain('-export const a = 1;\n+export const a = 10;');
        expect(second.changed).toBe(true);
        expect(await readFile(projects.path('demo', 'src/a.ts'), 'utf8')).toBe('export const a = 10;\nexport const b = 20;\n');
    });

    it('writes nothing when one operation fails, and names the lines of an ambiguous text', async () => {
        const call = patchTool(projects.config, {
            project: 'demo',
            path: 'src/a.ts',
            expectedHash: await readHash('src/a.ts'),
            operations: [
                {
                    find: 'a = 1',
                    replace: 'a = 10',
                },
                {
                    find: 'export const',
                    replace: 'const',
                },
            ],
        });

        await expect(call).rejects.toMatchObject({
            code: 'ambiguous',
            details: {
                lines: [
                    1,
                    2,
                ],
            },
        });
        expect(await readFile(projects.path('demo', 'src/a.ts'), 'utf8')).toBe('export const a = 1;\nexport const b = 2;\n');
    });
});
