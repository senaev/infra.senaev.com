import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestProjects, type TestProjects } from './createTestProjects';
import { formatSnippet, searchTool } from './searchTool';

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
    await projects.remove();
});

describe('formatSnippet', () => {
    it('shows matches with context in ripgrep style and joins close parts', () => {
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

        expect(formatSnippet(lines, 5, 1)).toBe('1-a\n2:hit\n3-b\n--\n9:hit');
        expect(formatSnippet(lines, 1, 0)).toBe('2:hit');
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

    it('reports a bad regular expression as an argument error', async () => {
        await expect(searchTool(projects.config, {
            project: 'demo',
            queries: ['('],
            regex: true,
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});
