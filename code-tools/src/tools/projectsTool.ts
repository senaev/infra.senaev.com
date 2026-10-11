import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { PROJECT_NAME_PATTERN } from 'senaev-utils/src/codeTools/codeCommands';
import { operationCheckpoint, throwIfOperationAborted } from 'senaev-utils/src/operations/operationContext';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { runGit } from '../git/runGit';

import type { CodeToolsConfig } from './codeToolsConfig';
import { readCodeToolArguments } from './projectAccess';

const PROJECT_NAME = new RegExp(PROJECT_NAME_PATTERN);

async function exists(path: string): Promise<boolean> {
    try {
        throwIfOperationAborted();
        await stat(path);
        throwIfOperationAborted();

        return true;
    } catch {
        throwIfOperationAborted();

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
        throwIfOperationAborted();

        return null;
    }
}

async function describeProject(config: CodeToolsConfig, name: string) {
    const root = join(config.projectsRoot, name);

    try {
        const pending = [
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
        ] as const;

        // A rejection must not release the operation slot while sibling Git processes clean up.
        await Promise.allSettled(pending);
        throwIfOperationAborted();
        const [
            branch,
            status,
            origin,
            hasAgentsMd,
        ] = await Promise.all(pending);

        return {
            name,
            // Empty on a detached HEAD.
            branch: branch.trim() === '' ? null : branch.trim(),
            changedFiles: status.split('\0').filter((entry) => entry !== '').length,
            origin,
            hasAgentsMd,
        };
    } catch (error) {
        throwIfOperationAborted();

        return {
            name,
            error: stringifyUnknownError(error),
        };
    }
}

/** Every folder with a `.git` in the projects root is a project. */
export async function projectsTool(config: CodeToolsConfig, input: unknown) {
    readCodeToolArguments(input, 'projects');
    await operationCheckpoint();

    const entries = await readdir(config.projectsRoot, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
        await operationCheckpoint();
        if (entry.isDirectory() && PROJECT_NAME.test(entry.name) && await exists(join(config.projectsRoot, entry.name, '.git'))) {
            names.push(entry.name);
        }
    }

    names.sort();

    const projects = [];

    // One project at a time bounds Git subprocess scheduling and exposes abort checkpoints.
    for (const name of names) {
        await operationCheckpoint();
        projects.push(await describeProject(config, name));
        await operationCheckpoint();
    }

    return { projects };
}
