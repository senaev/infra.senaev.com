import { readFile, stat } from 'node:fs/promises';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createTestRepositories, type TestRepositories } from './createTestRepositories';
import { listTool } from './listTool';
import { readTool } from './readTool';
import { runTool } from './runTool';

let repos: TestRepositories;

beforeEach(async () => {
    repos = await createTestRepositories({
        demo: {
            'AGENTS.md': '# Rules\n',
            'src/index.ts': 'export {};\n',
        },
    });
});

afterEach(async () => {
    await repos.remove();
});

describe('code tools in a git worktree', () => {
    it('lists, reads and runs in a worktree that "git worktree add" created', async () => {
        const worktree = repos.path('demo-feature');

        repos.git('demo', [
            'worktree',
            'add',
            '--quiet',
            '-b',
            'feature',
            worktree,
        ]);
        expect((await stat(repos.path('demo-feature', '.git'))).isFile()).toBe(true);

        const listed = await listTool(repos.config, {
            folder: worktree,
            recursive: true,
        });

        expect(listed.entries.map((entry) => entry.path)).toEqual([
            repos.path('demo-feature', 'AGENTS.md'),
            repos.path('demo-feature', 'src/index.ts'),
        ]);

        const read = await readTool(repos.config, { paths: [repos.path('demo-feature', 'src/index.ts')] });

        expect(read.files[0]?.content).toBe(await readFile(repos.path('demo', 'src/index.ts'), 'utf8'));

        const run = await runTool(repos.config, {
            cwd: worktree,
            command: 'git branch --show-current',
        });

        expect(run).toMatchObject({
            cwd: worktree,
            exitCode: 0,
            stdout: 'feature\n',
        });
    });
});
