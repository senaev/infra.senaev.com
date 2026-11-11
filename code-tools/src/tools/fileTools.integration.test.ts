import {
    lstat, mkdir, readFile, stat, symlink, writeFile,
} from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestRepositories, type TestRepositories } from './createTestRepositories';
import { listTool } from './listTool';
import { patchTool } from './patchTool';
import { readTool } from './readTool';
import { sliceLines } from './readCommand';
import { writeTool } from './writeTool';

let repos: TestRepositories;

beforeEach(async () => {
    repos = await createTestRepositories({
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
    await repos.remove();
});

function demo(path = ''): string {
    return repos.path('demo', path);
}

async function readHash(path: string): Promise<string> {
    return hashContent(await readFile(demo(path), 'utf8'));
}

/** A folder with files that is not in a git repository. */
async function createPlainFolder(): Promise<string> {
    const folder = repos.path('plain');

    await mkdir(repos.path('plain', 'sub'), { recursive: true });
    await writeFile(repos.path('plain', '.hidden'), 'hidden\n');
    await writeFile(repos.path('plain', 'note.txt'), 'note\n');
    await writeFile(repos.path('plain', 'sub/deep.txt'), 'deep\n');

    return folder;
}

describe('listTool', () => {
    it('lists one level with absolute paths, folders first, with ignored entries and without .git', async () => {
        const result = await listTool(repos.config, { folder: demo() });

        expect(result.folder).toBe(demo());
        expect(result.entries.map((entry) => entry.path)).toEqual([
            demo('.github'),
            demo('dist'),
            demo('src'),
            demo('.gitignore'),
            demo('README.md'),
        ]);
    });

    it('lists an empty folder and types symbolic links by their target at one level', async () => {
        await mkdir(demo('empty'));
        await symlink('src', demo('linked-folder'));
        await symlink('README.md', demo('linked-file'));
        await symlink('missing', demo('dangling'));

        const result = await listTool(repos.config, { folder: demo() });

        expect(result.entries).toEqual([
            {
                path: demo('.github'),
                type: 'folder',
            },
            {
                path: demo('dist'),
                type: 'folder',
            },
            {
                path: demo('empty'),
                type: 'folder',
            },
            {
                path: demo('linked-folder'),
                type: 'folder',
            },
            {
                path: demo('src'),
                type: 'folder',
            },
            {
                path: demo('.gitignore'),
                type: 'file',
                size: 6,
            },
            {
                path: demo('README.md'),
                type: 'file',
                size: 7,
            },
            {
                path: demo('dangling'),
                type: 'file',
            },
            {
                path: demo('linked-file'),
                type: 'file',
                size: 7,
            },
        ]);
    });

    it('applies a .gitignore of a parent folder to a recursive list of a subfolder', async () => {
        await writeFile(demo('.gitignore'), 'dist/\n*.log\n');
        await writeFile(demo('src/x.log'), 'log\n');

        const result = await listTool(repos.config, {
            folder: demo('src'),
            recursive: true,
        });

        expect(result.entries.map((entry) => entry.path)).toEqual([
            demo('src/a.ts'),
            demo('src/lib/c.ts'),
        ]);
    });

    it('lists files at any depth with "recursive" or "glob", and shows new untracked files', async () => {
        await writeFile(demo('src/new.ts'), '');

        const recursive = await listTool(repos.config, {
            folder: demo('src'),
            recursive: true,
        });
        const globbed = await listTool(repos.config, {
            folder: demo(),
            glob: 'c.ts',
        });

        expect(recursive.entries).toEqual([
            {
                path: demo('src/a.ts'),
                type: 'file',
                size: 40,
            },
            {
                path: demo('src/lib/c.ts'),
                type: 'file',
                size: 20,
            },
            {
                path: demo('src/new.ts'),
                type: 'file',
                size: 0,
            },
        ]);
        expect(globbed.entries.map((entry) => entry.path)).toEqual([demo('src/lib/c.ts')]);
    });

    it('pages the entries', async () => {
        const result = await listTool(repos.config, {
            folder: demo(),
            recursive: true,
            limit: 2,
            offset: 1,
        });

        expect(result).toMatchObject({
            total: 5,
            nextOffset: 3,
        });
        expect(result.entries.map((entry) => entry.path)).toEqual([
            demo('.gitignore'),
            demo('README.md'),
        ]);
    });

    it('lists a folder outside any git repository, dotfiles included', async () => {
        const folder = await createPlainFolder();
        const result = await listTool(repos.config, {
            folder,
            recursive: true,
        });

        expect(result.entries.map((entry) => entry.path)).toEqual([
            repos.path('plain', '.hidden'),
            repos.path('plain', 'note.txt'),
            repos.path('plain', 'sub/deep.txt'),
        ]);
    });

    it('normalizes the folder path', async () => {
        const result = await listTool(repos.config, { folder: `${demo('src/lib/../..')}/` });

        expect(result.folder).toBe(demo());
        expect(result.entries.map((entry) => entry.path)).toContain(demo('README.md'));
    });

    it('returns no entries for an empty folder', async () => {
        await mkdir(repos.path('empty'));

        expect(await listTool(repos.config, { folder: repos.path('empty') })).toEqual({
            folder: repos.path('empty'),
            total: 0,
            entries: [],
            nextOffset: null,
        });
    });

    it('rejects a missing folder and a relative folder', async () => {
        await expect(listTool(repos.config, { folder: demo('missing') })).rejects.toMatchObject({ code: 'not_found' });
        await expect(listTool(repos.config, { folder: 'demo/src' })).rejects.toMatchObject({ code: 'invalid_arguments' });
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

    it('stops before a line that does not fit and rejects an unpageable line', () => {
        expect(sliceLines(content, {
            startLine: 1,
            lineCount: 10,
        }, 9)).toMatchObject({
            content: 'one\ntwo\n',
            endLine: 2,
            nextStartLine: 3,
        });
        expect(() => sliceLines(content, {
            startLine: 3,
            lineCount: 10,
        }, 2)).toThrow('use head, tail or sed');
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
    it('rejects overlong lines without pretending their suffix was paginated', async () => {
        for (const text of [
            'x'.repeat(40000),
            `${'x'.repeat(40000)}\nEND\n`,
        ]) {
            await writeFile(demo('long.txt'), text);
            await expect(readTool(repos.config, { paths: [demo('long.txt')] }))
                .rejects.toMatchObject({
                    code: 'command_failed',
                    message: expect.stringContaining('use head, tail or sed'),
                });
        }
    });

    it('defers a whole file when only the aggregate response budget is too small', async () => {
        const first = `${'a'.repeat(29999)}\n`;
        const second = `${'b'.repeat(24999)}\n`;

        await writeFile(demo('first.txt'), first);
        await writeFile(demo('second.txt'), second);
        const page = await readTool(repos.config, {
            paths: [
                demo('first.txt'),
                demo('second.txt'),
            ],
        });

        expect(page.files.map((file) => file.content)).toEqual([first]);
        expect(page.remainingPaths).toEqual([demo('second.txt')]);
        const next = await readTool(repos.config, { paths: page.remainingPaths });

        expect(next.files[0]?.content).toBe(second);
        expect(next.files[0]?.hash).toBe(hashContent(second));
    });

    it('reads files with their hash, and reports a bad path without failing the others', async () => {
        const result = await readTool(repos.config, {
            paths: [
                demo('src/a.ts'),
                demo('missing.ts'),
                'README.md',
                demo('README.md'),
            ],
        });

        expect(result.files.map((file) => [
            file.path,
            file.content,
        ])).toEqual([
            [
                demo('src/a.ts'),
                'export const a = 1;\nexport const b = 2;\n',
            ],
            [
                demo('README.md'),
                '# Demo\n',
            ],
        ]);
        expect(result.files[0]?.hash).toBe(await readHash('src/a.ts'));
        expect(result.errors).toEqual([
            {
                path: demo('missing.ts'),
                code: 'not_found',
                message: `File "${demo('missing.ts')}" does not exist`,
            },
            {
                path: 'README.md',
                code: 'invalid_arguments',
                message: expect.stringContaining('must be an absolute path'),
            },
        ]);
    });

    it('reads a file outside any git repository and returns its normalized path', async () => {
        await createPlainFolder();

        const result = await readTool(repos.config, { paths: [repos.path('plain', 'sub/../note.txt')] });

        expect(result.files.map((file) => [
            file.path,
            file.content,
        ])).toEqual([
            [
                repos.path('plain', 'note.txt'),
                'note\n',
            ],
        ]);
    });

    it('rejects a relative path and refuses to read a binary file', async () => {
        await writeFile(demo('image.bin'), Buffer.from([
            1,
            0,
            2,
        ]));

        await expect(readTool(repos.config, { paths: ['src/a.ts'] })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(readTool(repos.config, { paths: [demo('image.bin')] })).rejects.toMatchObject({ code: 'forbidden_path' });
    });
});

describe('writeTool', () => {
    it('creates a file with missing folders, and refuses to overwrite it without a hash', async () => {
        const created = await writeTool(repos.config, {
            path: demo('src/new/d.ts'),
            content: 'export const d = 4;\n',
        });

        expect(created).toMatchObject({
            path: demo('src/new/d.ts'),
            created: true,
            hash: hashContent('export const d = 4;\n'),
        });
        expect(created.diff).toContain(`+++ b${demo('src/new/d.ts')}\n`);
        expect(created.diff).toContain('+export const d = 4;');
        await expect(writeTool(repos.config, {
            path: demo('src/new/d.ts'),
            content: 'x',
        })).rejects.toMatchObject({ code: 'already_exists' });
    });

    it('replaces a file with the right hash, keeps its mode, and refuses a stale hash', async () => {
        await writeFile(demo('run.sh'), 'echo 1\n', { mode: 0o755 });

        const hash = await readHash('run.sh');
        const replaced = await writeTool(repos.config, {
            path: demo('run.sh'),
            content: 'echo 2\n',
            expectedHash: hash,
        });

        expect(replaced).toMatchObject({
            created: false,
            changed: true,
        });
        expect((await stat(demo('run.sh'))).mode & 0o777).toBe(0o755);
        await expect(writeTool(repos.config, {
            path: demo('run.sh'),
            content: 'echo 3\n',
            expectedHash: hash,
        })).rejects.toMatchObject({ code: 'conflict' });
    });

    it('writes outside any git repository at a normalized path, and rejects a relative path', async () => {
        const written = await writeTool(repos.config, {
            path: repos.path('plain', 'x/../new.txt'),
            content: 'plain\n',
        });

        expect(written.path).toBe(repos.path('plain', 'new.txt'));
        expect(await readFile(repos.path('plain', 'new.txt'), 'utf8')).toBe('plain\n');
        await expect(writeTool(repos.config, {
            path: 'plain/other.txt',
            content: 'x',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });

    it('replaces the target of a symbolic link and keeps the link', async () => {
        await symlink('AGENTS.md', demo('CLAUDE.md'));
        await writeFile(demo('AGENTS.md'), 'rules\n');
        const changedPaths: string[] = [];

        const written = await writeTool(repos.config, {
            path: demo('CLAUDE.md'),
            content: 'new rules\n',
            expectedHash: hashContent('rules\n'),
        }, createCommandExecution({ changedPath: (path) => changedPaths.push(path) }));

        expect(written).toMatchObject({
            path: demo('CLAUDE.md'),
            changed: true,
        });
        expect(written.diff).toContain(`+++ b${demo('CLAUDE.md')}\n`);
        expect(await readFile(demo('AGENTS.md'), 'utf8')).toBe('new rules\n');
        expect((await lstat(demo('CLAUDE.md'))).isSymbolicLink()).toBe(true);
        expect(changedPaths).toEqual([demo('AGENTS.md')]);
    });

    it('rejects a new file at the path of a folder', async () => {
        await expect(writeTool(repos.config, {
            path: demo('src'),
            content: 'x',
        })).rejects.toMatchObject({
            code: 'invalid_arguments',
            message: expect.stringContaining('is a folder'),
        });
    });

    it('rejects a new file at "/"', async () => {
        await expect(writeTool(repos.config, {
            path: '/',
            content: 'x',
        })).rejects.toMatchObject({
            code: 'invalid_arguments',
            message: expect.stringContaining('is a folder'),
        });
    });

    it('fails when a parent of the new file is a regular file', async () => {
        const changedPaths: string[] = [];

        await expect(writeTool(repos.config, {
            path: demo('README.md/x.txt'),
            content: 'x',
        }, createCommandExecution({ changedPath: (path) => changedPaths.push(path) })))
            .rejects.toMatchObject({ code: 'command_failed' });
        expect(changedPaths).toEqual([]);
        expect(await readFile(demo('README.md'), 'utf8')).toBe('# Demo\n');
    });

    it('reports the first folder that it created as changed', async () => {
        const changedPaths: string[] = [];

        await writeTool(repos.config, {
            path: repos.path('plain', 'deep/new.txt'),
            content: 'x',
        }, createCommandExecution({ changedPath: (path) => changedPaths.push(path) }));

        expect(changedPaths).toEqual([
            repos.path('plain'),
            repos.path('plain', 'deep/new.txt'),
        ]);
    });
});

describe('patchTool', () => {
    it('replaces text and returns a hash that the next patch can use', async () => {
        const first = await patchTool(repos.config, {
            path: demo('src/a.ts'),
            expectedHash: await readHash('src/a.ts'),
            operations: [
                {
                    find: 'a = 1',
                    replace: 'a = 10',
                },
            ],
        });
        const second = await patchTool(repos.config, {
            path: demo('src/a.ts'),
            expectedHash: first.hash,
            operations: [
                {
                    find: 'b = 2',
                    replace: 'b = 20',
                },
            ],
        });

        expect(first.path).toBe(demo('src/a.ts'));
        expect(first.diff).toContain(`--- a${demo('src/a.ts')}\n+++ b${demo('src/a.ts')}\n`);
        expect(first.diff).toContain('-export const a = 1;\n+export const a = 10;');
        expect(second.changed).toBe(true);
        expect(await readFile(demo('src/a.ts'), 'utf8')).toBe('export const a = 10;\nexport const b = 20;\n');
    });

    it('patches the target of a symbolic link and keeps the link', async () => {
        await symlink('AGENTS.md', demo('CLAUDE.md'));
        await writeFile(demo('AGENTS.md'), 'rules\n');
        const changedPaths: string[] = [];

        const patched = await patchTool(repos.config, {
            path: demo('CLAUDE.md'),
            expectedHash: hashContent('rules\n'),
            operations: [
                {
                    find: 'rules',
                    replace: 'new rules',
                },
            ],
        }, createCommandExecution({ changedPath: (path) => changedPaths.push(path) }));

        expect(patched).toMatchObject({
            path: demo('CLAUDE.md'),
            changed: true,
        });
        expect(await readFile(demo('AGENTS.md'), 'utf8')).toBe('new rules\n');
        expect((await lstat(demo('CLAUDE.md'))).isSymbolicLink()).toBe(true);
        expect(changedPaths).toEqual([demo('AGENTS.md')]);
    });

    it('writes nothing when one operation fails, and names the lines of an ambiguous text', async () => {
        const call = patchTool(repos.config, {
            path: demo('src/a.ts'),
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
        expect(await readFile(demo('src/a.ts'), 'utf8')).toBe('export const a = 1;\nexport const b = 2;\n');
    });

    it('rejects a relative path and a missing file', async () => {
        const operations = [
            {
                find: 'a',
                replace: 'b',
            },
        ];

        await expect(patchTool(repos.config, {
            path: 'src/a.ts',
            expectedHash: await readHash('src/a.ts'),
            operations,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(patchTool(repos.config, {
            path: demo('missing.ts'),
            expectedHash: await readHash('src/a.ts'),
            operations,
        })).rejects.toMatchObject({ code: 'not_found' });
    });
});
