import { lstat } from 'node:fs/promises';

import { CLONE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import { optionalString, requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import { runGit } from '../git/runGit';
import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import {
    assertProjectName, projectPath, readCodeToolArguments,
} from './projectAccess';

const MAX_ERROR_CHARS = 4000;

/** "git@github.com:owner/repo.git" and "https://github.com/owner/repo" both give "repo". */
export function getRepositoryName(url: string): string {
    const lastSegment = url.replace(/[/]+$/, '').split(/[/:]/).pop() ?? '';

    return lastSegment.replace(/\.git$/, '');
}

function readUrl(args: Record<string, unknown>): string {
    const url = requiredNonEmptyString(args, 'url', CLONE_LIMITS.maxUrlLength).trim();

    // A leading "-" would be read as a git option.
    if (url.startsWith('-') || /\s/.test(url)) {
        throw invalidArguments('"url" must be a repository URL such as "git@github.com:owner/repo.git"');
    }

    return url;
}

async function assertFree(path: string, name: string): Promise<void> {
    try {
        await lstat(path);
    } catch (error) {
        if (isNotFoundError(error)) {
            return;
        }

        throw error;
    }

    throw new ToolError('already_exists', `Project "${name}" already exists; choose another "name" or use the existing project`);
}

export async function cloneTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'clone');
    const url = readUrl(args);
    const name = optionalString(args, 'name') ?? getRepositoryName(url);

    assertProjectName(name, 'name');

    const destination = projectPath(config, name);

    await assertFree(destination, name);

    const result = await runProcess('git', [
        'clone',
        '--quiet',
        '--',
        url,
        destination,
    ], {
        cwd: config.projectsRoot,
        timeoutMs: CLONE_LIMITS.timeoutSeconds * 1000,
        maxOutputChars: MAX_ERROR_CHARS,
        env: config.commandEnv,
    });

    if (result.exitCode !== 0) {
        const reason = result.timedOut ? `timed out after ${CLONE_LIMITS.timeoutSeconds} s` : result.stderr.trim();

        throw new ToolError('command_failed', `git clone failed: ${reason}`);
    }

    const branch = (await runGit(config, destination, [
        'branch',
        '--show-current',
    ])).trim();

    return {
        project: name,
        branch: branch === '' ? null : branch,
        durationMs: result.durationMs,
    };
}
