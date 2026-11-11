import { OperationManager } from 'senaev-utils/src/operations/OperationManager';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { runCommand } from './runCommand';
import { createTestRepositories, type TestRepositories } from './createTestRepositories';
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

describe('runTool', () => {
    it('runs bash in the given folder and returns a failing exit code as a result', async () => {
        const result = await runTool(repos.config, {
            cwd: repos.path('demo'),
            command: 'pwd; ls src; git branch --show-current; exit 2',
        });

        expect(result).toMatchObject({
            cwd: repos.path('demo'),
            exitCode: 2,
            timedOut: false,
        });
        expect(result.stdout).toBe(`${repos.path('demo')}\nindex.ts\nmain\n`);
    });

    it('runs in a folder outside any git repository, at a normalized path', async () => {
        const result = await runTool(repos.config, {
            cwd: `${repos.path('demo', 'src/../..')}/`,
            command: 'pwd; ls',
        });

        expect(result).toMatchObject({
            cwd: repos.root,
            exitCode: 0,
            stdout: `${repos.root}\ndemo\n`,
        });
    });

    it('does not pass the internal token to the command', async () => {
        // vitest.setup.ts puts the token into process.env, which the test config is made from.
        expect(process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS).toBeTruthy();

        const result = await runTool(repos.config, {
            cwd: repos.path('demo'),
            command: 'echo "token:${INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS:-}"',
        });

        expect(result.stdout).toBe('token:\n');
    });

    it('stops a command under the common execution deadline', async () => {
        const manager = new OperationManager('test');
        const args = {
            cwd: repos.path('demo'),
            command: 'sleep 30',
            timeoutSeconds: 1,
        };

        try {
            const result = await manager.launch({
                tool: 'run',
                args,
                run: (execution) => runCommand(repos.config, {
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
        await expect(runTool(repos.config, {
            cwd: repos.path('nope'),
            command: 'true',
        })).rejects.toMatchObject({ code: 'not_found' });
        await expect(runTool(repos.config, {
            cwd: repos.path('demo', 'AGENTS.md'),
            command: 'true',
        })).rejects.toMatchObject({ code: 'not_found' });
        await expect(runTool(repos.config, {
            cwd: 'demo',
            command: 'true',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});
