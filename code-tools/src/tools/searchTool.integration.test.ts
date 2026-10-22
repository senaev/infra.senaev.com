import {
    mkdir, rename, symlink, writeFile,
} from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as secureModule from 'senaev-utils/src/files/secureFilesystem/runSecureFilesystem';

import * as processModule from '../process/runProcess';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { searchTool } from './searchTool';
import { formatSnippet } from './searchCommand';

let projects: TestProjects;

beforeEach(async () => {
    projects = await createTestProjects({
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
    vi.restoreAllMocks();
    await projects.remove();
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
    it('finds literal text in all files except ignored ones, with line numbers', async () => {
        const result = await searchTool(projects.config, {
            project: 'demo',
            queries: ['fetchUser('],
            contextLines: 0,
        });

        expect(result).toMatchObject({
            matchedFiles: 1,
            totalMatches: 2,
            truncated: false,
            files: [
                {
                    path: 'src/api.ts',
                    matchCount: 2,
                    omittedMatches: 0,
                    snippet: '3:export function fetchUser() {}\n--\n6:fetchUser();',
                },
            ],
        });
    });

    it('searches dotfiles too, and limits the scope with a glob', async () => {
        const all = await searchTool(projects.config, {
            project: 'demo',
            queries: ['fetchuser'],
        });
        const yamlOnly = await searchTool(projects.config, {
            project: 'demo',
            queries: ['fetchuser'],
            glob: '*.yml',
        });

        expect(all.files.map((file) => file.path)).toEqual([
            '.github/ci.yml',
            'src/api.ts',
        ]);
        expect(yamlOnly.files.map((file) => file.path)).toEqual(['.github/ci.yml']);
    });

    it('reads queries as literal text unless "regex" is true', async () => {
        const literal = await searchTool(projects.config, {
            project: 'demo',
            queries: ['(1+2)'],
        });
        const regex = await searchTool(projects.config, {
            project: 'demo',
            queries: ['fetchUsers?\\(\\)'],
            regex: true,
            caseSensitive: true,
            folder: 'src',
            maxMatchesPerFile: 1,
            contextLines: 0,
        });

        expect(literal.files.map((file) => file.path)).toEqual(['src/util.ts']);
        expect(regex.files).toEqual([
            {
                path: 'src/api.ts',
                matchCount: 3,
                omittedMatches: 2,
                snippet: '3:export function fetchUser() {}',
            },
        ]);
    });

    it.each([
        'outside-folder',
        'outside-file',
        'outside-folder/secret.txt',
    ])('refuses to search through the symlink %s', async (folder) => {
        await mkdir(projects.path('other'));
        await writeFile(projects.path('other', 'secret.txt'), 'fetchUser secret\n');
        await symlink(projects.path('other'), projects.path('demo', 'outside-folder'));
        await symlink(projects.path('other', 'secret.txt'), projects.path('demo', 'outside-file'));

        await expect(searchTool(projects.config, {
            project: 'demo',
            queries: ['secret'],
            folder,
        })).rejects.toMatchObject({ code: 'forbidden_path' });
    });

    it('skips symlinks inside the searched folder', async () => {
        await mkdir(projects.path('other'));
        await writeFile(projects.path('other', 'secret.txt'), 'fetchUser secret\n');
        await symlink(projects.path('other'), projects.path('demo', 'src/outside-folder'));
        await symlink(projects.path('other', 'secret.txt'), projects.path('demo', 'src/outside-file'));

        const result = await searchTool(projects.config, {
            project: 'demo',
            queries: ['secret'],
        });

        expect(result.files).toEqual([]);
    });

    it('reports a missing folder as not found', async () => {
        await expect(searchTool(projects.config, {
            project: 'demo',
            queries: ['fetchUser'],
            folder: 'missing',
        })).rejects.toMatchObject({
            code: 'not_found',
            message: '"missing" does not exist',
        });
    });

    it('reports a bad regular expression as an argument error', async () => {
        await expect(searchTool(projects.config, {
            project: 'demo',
            queries: ['('],
            regex: true,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});

it('searches the private snapshot when the live folder changes just before rg starts', async () => {
    await mkdir(projects.path('other'));
    await writeFile(projects.path('other', 'secret.txt'), 'PRIVATE-FIXTURE');
    const run = processModule.runProcess;

    vi.spyOn(processModule, 'runProcess').mockImplementationOnce(async (...args) => {
        await rename(projects.path('demo', 'src'), projects.path('demo', 'moved'));
        await symlink(projects.path('other'), projects.path('demo', 'src'));

        return await run(...args);
    });
    const result = await searchTool(projects.config, {
        project: 'demo',
        folder: 'src',
        queries: [
            'fetchUser',
            'PRIVATE-FIXTURE',
        ],
    });

    expect(result.files.map((file) => file.path)).toEqual(['src/api.ts']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE-FIXTURE');
});

it('does not copy a folder replaced with a symlink after validation', async () => {
    await mkdir(projects.path('other'));
    await writeFile(projects.path('other', 'secret.txt'), 'PRIVATE-FIXTURE');
    const run = secureModule.runSecureFilesystem;

    vi.spyOn(secureModule, 'runSecureFilesystem').mockImplementationOnce(async (...args) => {
        await rename(projects.path('demo', 'src'), projects.path('demo', 'moved'));
        await symlink(projects.path('other'), projects.path('demo', 'src'));

        return await run(...args);
    });
    await expect(searchTool(projects.config, {
        project: 'demo',
        folder: 'src',
        queries: ['PRIVATE-FIXTURE'],
    }))
        .rejects.toMatchObject({ code: 'invalid_arguments' });
});

it('preserves an explicit glob overriding an ignored file', async () => {
    await writeFile(projects.path('demo', '.gitignore'), 'dist/\nignored.js\n');
    await writeFile(projects.path('demo', 'ignored.js'), 'fetchUser();\n');
    const result = await searchTool(projects.config, {
        project: 'demo',
        glob: '*.js',
        queries: ['fetchUser'],
    });

    expect(result.files.map((file) => file.path)).toEqual(['ignored.js']);
});
