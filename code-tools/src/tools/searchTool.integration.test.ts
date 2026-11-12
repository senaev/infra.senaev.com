import {
    mkdir, symlink, writeFile,
} from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestRepositories, type TestRepositories } from './createTestRepositories';
import { searchTool } from './searchTool';
import { formatSnippet } from './searchCommand';

let repos: TestRepositories;

beforeEach(async () => {
    repos = await createTestRepositories({
        demo: {
            '.gitignore': 'dist/\n',
            '.github/ci.yml': 'run: fetchUser\n',
            'src/api.ts': [
                'import x from "x";',
                '',
                'export function fetchUser() {}',
                'export function fetchUsers() {}',
                '',
                'fetchUser();',
                '',
            ].join('\n'),
            'src/util.ts': 'const a = (1+2);\n',
            'dist/api.js': 'fetchUser();\n',
        },
    });
});

afterEach(async () => {
    await repos.remove();
});

describe('formatSnippet', () => {
    it('shows matches with context in ripgrep style and joins close parts', async () => {
        const lines = [
            {
                line: 1,
                text: 'a',
                isMatch: false,
            },
            {
                line: 2,
                text: 'hit',
                isMatch: true,
            },
            {
                line: 3,
                text: 'b',
                isMatch: false,
            },
            {
                line: 9,
                text: 'hit',
                isMatch: true,
            },
        ];

        expect(await formatSnippet(lines, 5, 1, createCommandExecution())).toBe('1-a\n2:hit\n3-b\n--\n9:hit');
        expect(await formatSnippet(lines, 1, 0, createCommandExecution())).toBe('2:hit');
    });
});

describe('searchTool', () => {
    it('finds literal text in all files except ignored ones, with absolute paths and line numbers', async () => {
        const result = await searchTool(repos.config, {
            folder: repos.path('demo'),
            queries: ['fetchUser('],
            contextLines: 0,
        });

        expect(result).toMatchObject({
            folder: repos.path('demo'),
            matchedFiles: 1,
            totalMatches: 2,
            truncated: false,
            files: [
                {
                    path: repos.path('demo', 'src/api.ts'),
                    matchCount: 2,
                    omittedMatches: 0,
                    snippet: '3:export function fetchUser() {}\n--\n6:fetchUser();',
                },
            ],
        });
    });

    it('searches dotfiles too, and limits the scope with a glob', async () => {
        const all = await searchTool(repos.config, {
            folder: repos.path('demo'),
            queries: ['fetchuser'],
        });
        const yamlOnly = await searchTool(repos.config, {
            folder: repos.path('demo'),
            queries: ['fetchuser'],
            glob: '*.yml',
        });

        expect(all.files.map((file) => file.path)).toEqual([
            repos.path('demo', '.github/ci.yml'),
            repos.path('demo', 'src/api.ts'),
        ]);
        expect(yamlOnly.files.map((file) => file.path)).toEqual([repos.path('demo', '.github/ci.yml')]);
    });

    it('reads queries as literal text unless "regex" is true', async () => {
        const literal = await searchTool(repos.config, {
            folder: repos.path('demo'),
            queries: ['(1+2)'],
        });
        const regex = await searchTool(repos.config, {
            folder: repos.path('demo', 'src'),
            queries: ['fetchUsers?\\(\\)'],
            regex: true,
            caseSensitive: true,
            maxMatchesPerFile: 1,
            contextLines: 0,
        });

        expect(literal.files.map((file) => file.path)).toEqual([repos.path('demo', 'src/util.ts')]);
        expect(regex.files).toEqual([
            {
                path: repos.path('demo', 'src/api.ts'),
                matchCount: 3,
                omittedMatches: 2,
                snippet: '3:export function fetchUser() {}',
            },
        ]);
    });

    it('searches a folder outside any git repository at a normalized path', async () => {
        await mkdir(repos.path('plain/sub'), { recursive: true });
        await writeFile(repos.path('plain', 'sub/notes.txt'), 'fetchUser later\n');

        const result = await searchTool(repos.config, {
            folder: `${repos.path('plain', 'sub/..')}/`,
            queries: ['fetchUser'],
        });

        expect(result.folder).toBe(repos.path('plain'));
        expect(result.files.map((file) => file.path)).toEqual([repos.path('plain', 'sub/notes.txt')]);
    });

    it('skips symlinks inside the searched folder', async () => {
        await mkdir(repos.path('other'));
        await writeFile(repos.path('other', 'secret.txt'), 'fetchUser secret\n');
        await symlink(repos.path('other'), repos.path('demo', 'src/outside-folder'));
        await symlink(repos.path('other', 'secret.txt'), repos.path('demo', 'src/outside-file'));

        const result = await searchTool(repos.config, {
            folder: repos.path('demo'),
            queries: ['secret'],
        });

        expect(result.files).toEqual([]);
    });

    it('reports a missing folder as not found and a relative folder as an argument error', async () => {
        await expect(searchTool(repos.config, {
            folder: repos.path('demo', 'missing'),
            queries: ['fetchUser'],
        })).rejects.toMatchObject({
            code: 'not_found',
            message: `Folder "${repos.path('demo', 'missing')}" does not exist`,
        });
        await expect(searchTool(repos.config, {
            folder: 'demo',
            queries: ['fetchUser'],
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });

    it('reports a bad regular expression as an argument error', async () => {
        await expect(searchTool(repos.config, {
            folder: repos.path('demo'),
            queries: ['('],
            regex: true,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});
