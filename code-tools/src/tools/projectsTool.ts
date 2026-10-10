import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { PROJECT_NAME_PATTERN } from 'senaev-utils/src/codeTools/codeToolDefinitions';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { runGit } from '../git/runGit';

import type { CodeToolsConfig } from './codeToolsConfig';
import { readCodeToolArguments } from './projectAccess';

const PROJECT_NAME = new RegExp(PROJECT_NAME_PATTERN);

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);

        return true;
    } catch {
        return false;
    }
}

async function readRemote(config: CodeToolsConfig, root: string): Promise<string | null> {
    try {
        return (await runGit(config, root, [
            'remote',
            'get-url',
            'origin',
        ])).trim();
    } catch {
        return null;
    }
}

async function describeProject(config: CodeToolsConfig, name: string) {
    const root = join(config.projectsRoot, name);

    try {
        const [
            branch,
            status,
            origin,
            hasAgentsMd,
        ] = await Promise.all([
            runGit(config, root, [
                'branch',
                '--show-current',
            ]),
            runGit(config, root, [
                'status',
                '--porcelain',
                '-z',
            ]),
            readRemote(config, root),
            exists(join(root, 'AGENTS.md')),
        ]);

        return {
            name,
            // Empty on a detached HEAD.
            branch: branch.trim() === '' ? null : branch.trim(),
            changedFiles: status.split('\0').filter((entry) => entry !== '').length,
            origin,
            hasAgentsMd,
        };
    } catch (error) {
        return {
            name,
            error: stringifyUnknownError(error),
        };
    }
}

/** Every folder with a `.git` in the projects root is a project. */
export async function projectsTool(config: CodeToolsConfig, input: unknown) {
    readCodeToolArguments(input, 'projects');

    const entries = await readdir(config.projectsRoot, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
        if (entry.isDirectory() && PROJECT_NAME.test(entry.name) && await exists(join(config.projectsRoot, entry.name, '.git'))) {
            names.push(entry.name);
        }
    }

    names.sort();

    return { projects: await Promise.all(names.map((name) => describeProject(config, name))) };
}
