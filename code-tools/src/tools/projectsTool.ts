import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { PROJECT_NAME_PATTERN } from 'senaev-utils/src/codeTools/codeCommands';
import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { createCommandAdapter } from 'senaev-utils/src/toolServer/createCommandAdapter';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { runGit } from '../git/runGit';

import type { CodeToolsConfig } from './codeToolsConfig';
import { readCodeToolArguments } from './projectAccess';

const PROJECT_NAME = new RegExp(PROJECT_NAME_PATTERN);

async function exists(path: string, execution: CommandExecution): Promise<boolean> {
    try {
        execution.throwIfAborted();
        await stat(path);
        execution.throwIfAborted();

        return true;
    } catch {
        execution.throwIfAborted();

        return false;
    }
}

async function readRemote(config: CodeToolsConfig, root: string, execution: CommandExecution): Promise<string | null> {
    try {
        return (await runGit(config, root, [
            'remote',
            'get-url',
            'origin',
        ], execution)).trim();
    } catch {
        execution.throwIfAborted();

        return null;
    }
}

async function describeProject(config: CodeToolsConfig, name: string, execution: CommandExecution) {
    const root = join(config.projectsRoot, name);

    try {
        const pending = [
            runGit(config, root, [
                'branch',
                '--show-current',
            ], execution),
            runGit(config, root, [
                'status',
                '--porcelain',
                '-z',
            ], execution),
            readRemote(config, root, execution),
            exists(join(root, 'AGENTS.md'), execution),
        ] as const;

        // A rejection must not release the operation slot while sibling Git processes clean up.
        await Promise.allSettled(pending);
        execution.throwIfAborted();
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
        execution.throwIfAborted();

        return {
            name,
            error: stringifyUnknownError(error),
        };
    }
}

/** Every folder with a `.git` in the projects root is a project. */
export type ProjectsCommandInput = Record<string, never>;

export async function projectsCommand(config: CodeToolsConfig, _input: ProjectsCommandInput, execution: CommandExecution) {
    await execution.checkpoint();

    const entries = await readdir(config.projectsRoot, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
        await execution.checkpoint();
        if (entry.isDirectory() && PROJECT_NAME.test(entry.name) && await exists(join(config.projectsRoot, entry.name, '.git'), execution)) {
            names.push(entry.name);
        }
    }

    names.sort();

    const projects = [];

    // One project at a time bounds Git subprocess scheduling and exposes abort checkpoints.
    for (const name of names) {
        await execution.checkpoint();
        projects.push(await describeProject(config, name, execution));
        await execution.checkpoint();
    }

    return { projects };
}

export type ProjectsCommandResult = Awaited<ReturnType<typeof projectsCommand>>;

export const projectsTool = createCommandAdapter((input: unknown): ProjectsCommandInput => {
    readCodeToolArguments(input, 'projects');

    return {};
}, projectsCommand);
