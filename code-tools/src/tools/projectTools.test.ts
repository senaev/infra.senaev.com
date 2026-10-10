import { mkdir, writeFile } from 'node:fs/promises';

import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { cloneTool, getRepositoryName } from './cloneTool';
import { createTestProjects, type TestProjects } from './createTestProjects';
import { projectsTool } from './projectsTool';
import { runTool } from './runTool';

let projects: TestProjects;

beforeEach(async () => {
    projects = await createTestProjects({
        demo: {
            'AGENTS.md': '# Rules\n',
            'src/index.ts': 'export {};\n',
        },
        other: { 'README.md': 'other\n' },
    });
});

afterEach(async () => {
    await projects.remove();
});

describe('projectsTool', () => {
    it('lists every git repository with its branch, changes and AGENTS.md', async () => {
        await writeFile(projects.path('demo', 'new.ts'), '');
        await mkdir(projects.path('not-a-repo'));

        const result = await projectsTool(projects.config, {});

        expect(result.projects).toEqual([
            {
                name: 'demo',
                branch: 'main',
                changedFiles: 1,
                origin: null,
                hasAgentsMd: true,
            },
            {
                name: 'other',
                branch: 'main',
                changedFiles: 0,
                origin: null,
                hasAgentsMd: false,
            },
        ]);
    });

    it('rejects arguments it does not know', async () => {
        await expect(projectsTool(projects.config, { all: true })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});

describe('cloneTool', () => {
    it('takes the project name from the repository URL', () => {
        expect(getRepositoryName('git@github.com:senaev/infra.senaev.com.git')).toBe('infra.senaev.com');
        expect(getRepositoryName('https://github.com/senaev/repo/')).toBe('repo');
    });

    it('clones a repository into a new project', async () => {
        const result = await cloneTool(projects.config, {
            url: projects.path('demo'),
            name: 'demo-copy',
        });

        expect(result).toMatchObject({
            project: 'demo-copy',
            branch: 'main',
        });
        expect((await projectsTool(projects.config, {})).projects.map((project) => project.name)).toEqual([
            'demo',
            'demo-copy',
            'other',
        ]);
    });

    it('refuses an existing project, an option-like URL and a bad name', async () => {
        await expect(cloneTool(projects.config, { url: projects.path('demo') })).rejects.toMatchObject({ code: 'already_exists' });
        await expect(cloneTool(projects.config, { url: '--upload-pack=touch /tmp/x' })).rejects.toMatchObject({ code: 'invalid_arguments' });
        await expect(cloneTool(projects.config, {
            url: projects.path('demo'),
            name: '../escape',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });

    it('reports a failed clone with git\'s message', async () => {
        await expect(cloneTool(projects.config, {
            url: projects.path('missing'),
            name: 'x',
        })).rejects.toMatchObject({ code: 'command_failed' });
    });
});

describe('runTool', () => {
    it('runs bash in the project folder and returns a failing exit code as a result', async () => {
        const result = await runTool(projects.config, {
            project: 'demo',
            command: 'pwd; ls src; git branch --show-current; exit 2',
        });

        expect(result).toMatchObject({
            project: 'demo',
            exitCode: 2,
            timedOut: false,
        });
        expect(result.stdout).toContain('demo\nindex.ts\nmain\n');
    });

    it('does not pass the internal token to the command', async () => {
        // vitest.setup.ts puts the token into process.env, which the test config is made from.
        expect(process.env.INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS).toBeTruthy();

        const result = await runTool(projects.config, {
            project: 'demo',
            command: 'echo "token:${INTERNAL_TOKEN_BETWEEN_CLUSTER_HELPER_AND_CODE_TOOLS:-}"',
        });

        expect(result.stdout).toBe('token:\n');
    });

    it('stops a command after its timeout', async () => {
        const result = await runTool(projects.config, {
            project: 'demo',
            command: 'sleep 30',
            timeoutSeconds: 1,
        });

        expect(result.timedOut).toBe(true);
    });

    it('refuses a project that does not exist or a name that climbs out', async () => {
        await expect(runTool(projects.config, {
            project: 'nope',
            command: 'true',
        })).rejects.toMatchObject({ code: 'not_found' });
        await expect(runTool(projects.config, {
            project: '..',
            command: 'true',
        })).rejects.toMatchObject({ code: 'invalid_arguments' });
    });
});
