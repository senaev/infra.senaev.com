import { readFile, stat } from 'node:fs/promises';

import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { runCommand } from './runCommand';
import { createTestProjects, type TestProjects } from './createTestProjects';
import { listTool } from './listTool';
import { readTool } from './readTool';
import { runTool } from './runTool';

let projects: TestProjects;

beforeEach(async () => {
    projects = await createTestProjects({
        demo: {
            'AGENTS.md': '# Rules\n',
            'src/index.ts': 'export {};\n',
        },
    });
});

afterEach(async () => {
    await projects.remove();
});

describe('runTool', () => {
    it('runs bash in the given folder and returns a failing exit code as a result', async () => {
        const result = await runTool(projects.config, {
            cwd: projects.path('demo'),
            command: 'pwd; ls src; git branch --show-current; exit 2',
        });

        expect(result).toMatchObject({
            cwd: projects.path('demo'),
            exitCode: 2,
            timedOut: false,
        });
        expect(result.stdout).toBe(`${projects.path('demo')}\nindex.ts\nmain\n`);
    });

    it('runs in a folder outside any git repository, at a normalized path', async () => {
        const result = await runTool(projects.config, {
            cwd: `${projects.path('demo', 'src/../..')}/`,
            command: 'pwd; ls',
        });

        expect(result).toMatchObject({
            cwd: projects.root,
            exitCode: 0,
            stdout: `${projects.root}\ndemo\n`,
        });
    });

    it('does not pass the internal token to the command', async () => {
        // vitest.setup.ts puts the token into process.env, which the test config is made from.
        expect(process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS).toBeTruthy();

        const result = await runTool(projects.config, {
            cwd: projects.path('demo'),
            command: 'echo "token:${INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS:-}"',
        });

        expect(result.stdout).toBe('token:\n');
    });

    it('stops a command under the common execution deadline', async () => {
        const manager = new OperationManager('test');
        const args = {
            cwd: projects.path('demo'),
            command: 'sleep 30',
            timeoutSeconds: 1,
        };

        try {
            const result = await manager.launch({
                tool: 'run',
                args,
                run: (execution) => runCommand(projects.config, {
                    cwd: args.cwd,
                    command: args.command,
                }, execution),
            });

            expect(result).toMatchObject({
                code: 'timed_out',
                operation: { state: 'timed_out' },
            });
        } finally {
            await manager.close();
        }
    });

    it('refuses a folder that does not exist, a file and a relative folder', async () => {
        await expect(runTool(projects.config, {
            cwd: projects.path('nope'),
            command: 'true',
        })).rejects.toMatchObject({ code: 'not_found' });
        await expect(runTool(projects.config, {
            cwd: projects.path('demo', 'AGENTS.md'),
            command: 'true',
        })).rejects.toMatchObject({ code: 'not_found' });
        await expect(runTool(projects.config, {
            cwd: 'demo',
            command: 'true',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});

describe('code tools in a git worktree', () => {
    it('lists, reads and runs in a worktree that "git worktree add" created', async () => {
        const worktree = projects.path('demo-feature');

        projects.git('demo', [
            'worktree',
            'add',
            '--quiet',
            '-b',
            'feature',
            worktree,
        ]);
        expect((await stat(projects.path('demo-feature', '.git'))).isFile()).toBe(true);

        const listed = await listTool(projects.config, {
            folder: worktree,
            recursive: true,
        });

        expect(listed.entries.map((entry) => entry.path)).toEqual([
            projects.path('demo-feature', 'AGENTS.md'),
            projects.path('demo-feature', 'src/index.ts'),
        ]);

        const read = await readTool(projects.config, { paths: [projects.path('demo-feature', 'src/index.ts')] });

        expect(read.files[0]?.content).toBe(await readFile(projects.path('demo', 'src/index.ts'), 'utf8'));

        const run = await runTool(projects.config, {
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
