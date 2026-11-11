import { execFileSync } from 'node:child_process';
import {
    mkdir, mkdtemp, realpath, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createCodeToolsConfig, type CodeToolsConfig } from './codeToolsConfig';

export type TestRepositories = {
    config: CodeToolsConfig;
    /** The temporary folder that holds the repositories; it is not a repository itself. */
    root: string;
    /** The absolute path of a file in a test repository. */
    path: (repository: string, relativePath?: string) => string;
    git: (repository: string, args: readonly string[]) => string;
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

/** A temporary folder with one committed git repository per entry, for tests only. */
export async function createTestRepositories(repos: Record<string, Record<string, string>>): Promise<TestRepositories> {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'code-tools-test-')));
    const config = createCodeToolsConfig({
        ...process.env,
        ...TEST_GIT_ENV,
    });
    const git = (repository: string, args: readonly string[]) => execFileSync('git', args, {
        cwd: join(root, repository),
        env: config.commandEnv,
        encoding: 'utf8',
    });

    for (const [
        repository,
        files,
    ] of Object.entries(repos)) {
        await mkdir(join(root, repository));

        for (const [
            relativePath,
            content,
        ] of Object.entries(files)) {
            await mkdir(dirname(join(root, repository, relativePath)), { recursive: true });
            await writeFile(join(root, repository, relativePath), content, 'utf8');
        }

        git(repository, [
            'init',
            '--quiet',
            '--initial-branch=main',
        ]);
        git(repository, [
            'add',
            '--all',
        ]);
        git(repository, [
            'commit',
            '--quiet',
            '--allow-empty',
            '--message=init',
        ]);
    }

    return {
        config,
        root,
        path: (repository, relativePath = '') => join(root, repository, relativePath),
        git,
        remove: () => rm(root, {
            recursive: true,
            force: true,
        }),
    };
}
