import { execFileSync } from 'node:child_process';
import {
    mkdir, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createCodeToolsConfig, type CodeToolsConfig } from './codeToolsConfig';

export type TestProjects = {
    config: CodeToolsConfig;
    /** The absolute path of a file in a test project. */
    path: (project: string, relativePath?: string) => string;
    git: (project: string, args: readonly string[]) => string;
    remove: () => Promise<void>;
};

const TEST_GIT_ENV = {
    // The machine's own git config, hooks included, must not change or slow down the tests.
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
};

/** A projects folder on disk with one committed git repository per entry, for tests only. */
export async function createTestProjects(projects: Record<string, Record<string, string>>): Promise<TestProjects> {
    const root = await mkdtemp(join(tmpdir(), 'code-tools-test-'));
    const config = createCodeToolsConfig(root, {
        ...process.env,
        ...TEST_GIT_ENV,
    });
    const git = (project: string, args: readonly string[]) => execFileSync('git', args, {
        cwd: join(root, project),
        env: config.commandEnv,
        encoding: 'utf8',
    });

    for (const [
        project,
        files,
    ] of Object.entries(projects)) {
        await mkdir(join(root, project));

        for (const [
            relativePath,
            content,
        ] of Object.entries(files)) {
            await mkdir(dirname(join(root, project, relativePath)), { recursive: true });
            await writeFile(join(root, project, relativePath), content, 'utf8');
        }

        git(project, [
            'init',
            '--quiet',
            '--initial-branch=main',
        ]);
        git(project, [
            'add',
            '--all',
        ]);
        git(project, [
            'commit',
            '--quiet',
            '--allow-empty',
            '--message=init',
        ]);
    }

    return {
        config,
        path: (project, relativePath = '') => join(root, project, relativePath),
        git,
        remove: () => rm(root, {
            recursive: true,
            force: true,
        }),
    };
}
