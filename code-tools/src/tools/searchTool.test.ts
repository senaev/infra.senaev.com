import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    afterEach, describe, expect, it, vi,
} from 'vitest';

import { type ProcessResult, runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import { formatSnippet } from './searchCommand';
import { searchTool } from './searchTool';

vi.mock('../process/runProcess', () => {
    return { runProcess: vi.fn() };
});

vi.mock('./projectAccess', async (importOriginal) => {
    return {
        ...await importOriginal<typeof import('./projectAccess')>(),
        resolveNamedProject: vi.fn((_config: unknown, name: string) => Promise.resolve({
            name,
            root: `/projects/${name}`,
        })),
        assertExistingPathHasNoSymlink: vi.fn(() => Promise.resolve()),
    };
});

const CONFIG: CodeToolsConfig = {
    projectsRoot: '/projects',
    commandEnv: { PATH: '/usr/bin' },
};

type RipgrepLine = {
    type: 'match' | 'context';
    path: string;
    line: number;
    text: string;
};

function ripgrepJson(lines: readonly RipgrepLine[]): string {
    return [
        JSON.stringify({
            type: 'begin',
            data: { path: { text: './ignored' } },
        }),
        ...lines.map(({
            type, path, line, text,
        }) => JSON.stringify({
            type,
            data: {
                path: { text: `./${path}` },
                lines: { text: `${text}\n` },
                line_number: line,
                submatches: type === 'match' ? [{ start: 0 }] : [],
            },
        })),
    ].join('\n');
}

function mockRipgrep(result: Partial<ProcessResult>) {
    vi.mocked(runProcess).mockResolvedValue({
        exitCode: 0,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        outputTruncated: false,
        durationMs: 1,
        ...result,
    });
}

afterEach(() => {
    vi.mocked(runProcess).mockReset();
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
    it('runs ripgrep for literal, case-insensitive text in the project root, dotfiles included', async () => {
        mockRipgrep({ exitCode: 1 });

        await searchTool(CONFIG, {
            project: 'demo',
            queries: ['fetchUser('],
            contextLines: 0,
        });

        expect(runProcess).toHaveBeenCalledWith('rg', [
            '--json',
            '--no-config',
            '--hidden',
            '--glob',
            '!.git',
            '--fixed-strings',
            '--ignore-case',
            '--context',
            '0',
            '--max-filesize',
            '1M',
            '-e',
            'fetchUser(',
            '--',
            '.',
        ], expect.objectContaining({
            cwd: '/projects/demo',
            env: CONFIG.commandEnv,
            keep: 'start',
        }));
    });

    it('passes regex, case, glob, folder and every query to ripgrep', async () => {
        mockRipgrep({ exitCode: 1 });

        await searchTool(CONFIG, {
            project: 'demo',
            queries: [
                'fetchUsers?\\(\\)',
                'other',
            ],
            regex: true,
            caseSensitive: true,
            glob: '*.yml',
            folder: 'src',
            contextLines: 2,
        });

        expect(vi.mocked(runProcess).mock.calls[0]?.[1]).toEqual([
            '--json',
            '--no-config',
            '--hidden',
            '--glob',
            '!.git',
            '--case-sensitive',
            '--context',
            '2',
            '--max-filesize',
            '1M',
            '--glob-case-insensitive',
            '--glob',
            '*.yml',
            '-e',
            'fetchUsers?\\(\\)',
            '-e',
            'other',
            '--',
            'src',
        ]);
    });

    it('groups ripgrep matches by file, sorted, with counts and snippets', async () => {
        mockRipgrep({
            stdout: ripgrepJson([
                {
                    type: 'match',
                    path: 'src/api.ts',
                    line: 3,
                    text: 'export function fetchUser() {}',
                },
                {
                    type: 'context',
                    path: 'src/api.ts',
                    line: 4,
                    text: 'export function fetchUsers() {}',
                },
                {
                    type: 'match',
                    path: 'src/api.ts',
                    line: 6,
                    text: 'fetchUser();',
                },
                {
                    type: 'match',
                    path: '.github/ci.yml',
                    line: 1,
                    text: 'run: fetchUser',
                },
            ]),
        });

        expect(await searchTool(CONFIG, {
            project: 'demo',
            queries: ['fetchUser'],
            contextLines: 1,
            maxMatchesPerFile: 1,
        })).toEqual({
            project: 'demo',
            matchedFiles: 2,
            totalMatches: 3,
            nextOffset: null,
            truncated: false,
            files: [
                {
                    path: '.github/ci.yml',
                    matchCount: 1,
                    omittedMatches: 0,
                    snippet: '1:run: fetchUser',
                },
                {
                    path: 'src/api.ts',
                    matchCount: 2,
                    omittedMatches: 1,
                    snippet: '3:export function fetchUser() {}\n4-export function fetchUsers() {}',
                },
            ],
        });
    });

    it('reports cut ripgrep output as truncated and skips its broken last line', async () => {
        mockRipgrep({
            stdout: `${ripgrepJson([
                {
                    type: 'match',
                    path: 'a.ts',
                    line: 1,
                    text: 'hit',
                },
            ])}\n{"type":"mat`,
            outputTruncated: true,
        });

        expect(await searchTool(CONFIG, {
            project: 'demo',
            queries: ['hit'],
        })).toMatchObject({
            matchedFiles: 1,
            truncated: true,
        });
    });

    it('reports a ripgrep error without results as an argument error', async () => {
        mockRipgrep({
            exitCode: 2,
            stderr: 'regex parse error\n',
        });

        await expect(searchTool(CONFIG, {
            project: 'demo',
            queries: ['('],
            regex: true,
        })).rejects.toMatchObject({
            code: 'invalid_arguments',
            message: 'ripgrep failed: regex parse error',
        });
    });

    it('keeps the results and warns when ripgrep fails on some files', async () => {
        mockRipgrep({
            exitCode: 2,
            stdout: ripgrepJson([
                {
                    type: 'match',
                    path: 'a.ts',
                    line: 1,
                    text: 'hit',
                },
            ]),
            stderr: 'b.ts: Permission denied\n',
        });

        expect(await searchTool(CONFIG, {
            project: 'demo',
            queries: ['hit'],
        })).toMatchObject({
            matchedFiles: 1,
            warnings: 'b.ts: Permission denied',
        });
    });

    it('does not run ripgrep in a .git folder', async () => {
        await expect(searchTool(CONFIG, {
            project: 'demo',
            queries: ['hit'],
            folder: '.git',
        })).rejects.toMatchObject({ code: 'forbidden_path' });
        expect(runProcess).not.toHaveBeenCalled();
    });
});
