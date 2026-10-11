import {
    lstat, mkdir, mkdtemp, rm,
} from 'node:fs/promises';
import { join } from 'node:path';

import { CLONE_LIMITS } from 'senaev-utils/src/codeTools/codeToolLimits';
import {
    operationCheckpoint, operationContext, recordChangedPath, throwIfOperationAborted,
} from 'senaev-utils/src/operations/operationContext';
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

async function notePublication(temporary: string, name: string): Promise<void> {
    try {
        await lstat(temporary);
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }

        recordChangedPath(name);
    }
}

export async function cloneTool(config: CodeToolsConfig, input: unknown) {
    const args = readCodeToolArguments(input, 'clone');
    const url = readUrl(args);
    const name = optionalString(args, 'name') ?? getRepositoryName(url);

    assertProjectName(name, 'name');

    const destination = projectPath(config, name);

    await operationCheckpoint();
    await assertFree(destination, name);
    const reservation = join(config.projectsRoot, `.clone-${name}.lock`);

    try {
        await mkdir(reservation);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new ToolError('conflict', `A clone of "${name}" is already reserved; inspect stale reservations after a restart`);
        }

        throw error;
    }

    let temporary: string | undefined;

    try {
        await operationCheckpoint();
        temporary = await mkdtemp(join(config.projectsRoot, `.clone-${name}-`));
        const context = operationContext();
        const result = await runProcess('git', [
            'clone',
            '--progress',
            '--',
            url,
            temporary,
        ], {
            cwd: config.projectsRoot,
            ...context && {
                signal: context.signal,
                onOutput: context.log,
            },
            maxOutputChars: MAX_ERROR_CHARS,
            env: config.commandEnv,
        });

        throwIfOperationAborted();
        if (result.exitCode !== 0) {
            throw new ToolError('command_failed', `git clone failed: ${result.stderr.trim()}`);
        }

        const branch = (await runGit(config, temporary, [
            'branch',
            '--show-current',
        ])).trim();

        await operationCheckpoint();
        // Linux renameat2(RENAME_NOREPLACE) publishes an entire directory atomically.
        // Plain fs.rename can replace an unrelated empty directory after a race.
        // python3 is an existing required dependency of the opencode-serve image.
        try {
            const publication = await runProcess('python3', [
                '-c',
                [
                    'import ctypes, errno, os, sys',
                    'libc = ctypes.CDLL(None, use_errno=True)',
                    'rename = libc.renameat2',
                    'rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]',
                    'if rename(-100, os.fsencode(sys.argv[1]), -100, os.fsencode(sys.argv[2]), 1) != 0:',
                    '    code = ctypes.get_errno()',
                    '    print(os.strerror(code), file=sys.stderr)',
                    '    sys.exit(17 if code == errno.EEXIST else 1)',
                ].join('\n'),
                temporary,
                destination,
            ], {
                cwd: config.projectsRoot,
                ...context === undefined
                    ? {}
                    : {
                        signal: context.signal,
                        onOutput: context.log,
                    },
                maxOutputChars: MAX_ERROR_CHARS,
                env: config.commandEnv,
            });

            if (publication.exitCode !== 0) {
                throw new ToolError(
                    publication.exitCode === 17 ? 'conflict' : 'command_failed',
                    `Clone publication failed: ${publication.stderr.trim()}`
                );
            }
        } finally {
            // Publication may win a race with abort. Discover that change before reporting
            // terminal cancellation; never remove the published destination.
            await notePublication(temporary, name);
        }

        throwIfOperationAborted();

        return {
            project: name,
            branch: branch === '' ? null : branch,
            durationMs: result.durationMs,
        };
    } finally {
        // These paths were exclusively created by this invocation; never scan/remove
        // other reservations, old temporary clones or the final destination.
        try {
            if (temporary !== undefined) {
                await rm(temporary, {
                    recursive: true,
                    force: true,
                });
            }
        } finally {
            await rm(reservation, { recursive: true });
        }
    }
}
