import {
    lstat, mkdir, mkdtemp, rm,
} from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import { runGit } from '../git/runGit';
import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';
import { assertProjectName, projectPath } from './projectAccess';

const MAX_ERROR_CHARS = 4000;

/** "git@github.com:owner/repo.git" and "https://github.com/owner/repo" both give "repo". */
export function getRepositoryName(url: string): string {
    const lastSegment = url.replace(/[/]+$/, '').split(/[/:]/).pop() ?? '';

    return lastSegment.replace(/\.git$/, '');
}

async function assertFree(path: string, name: string, execution: CommandExecution): Promise<void> {
    try {
        await lstat(path);
    } catch (error) {
        execution.throwIfAborted();
        if (isNotFoundError(error)) {
            return;
        }

        throw error;
    }

    throw new ToolError('already_exists', `Project "${name}" already exists; choose another "name" or use the existing project`);
}

async function notePublication(temporary: string, name: string, execution: CommandExecution): Promise<void> {
    try {
        await lstat(temporary);
    } catch (error) {
        if (!isNotFoundError(error)) {
            throw error;
        }

        execution.changedPath(name);
    }
}

export type CloneCommandInput = { url: string; name: string };

export async function cloneCommand(config: CodeToolsConfig, input: CloneCommandInput, execution: CommandExecution) {
    const { url, name } = input;

    assertProjectName(name, 'name');

    const destination = projectPath(config, name);

    await execution.checkpoint();
    await assertFree(destination, name, execution);
    const reservation = join(config.projectsRoot, `.clone-${name}.lock`);

    try {
        await mkdir(reservation);
    } catch (error) {
        execution.throwIfAborted();
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new ToolError('conflict', `A clone of "${name}" is already reserved; inspect stale reservations after a restart`);
        }

        throw error;
    }

    let temporary: string | undefined;

    try {
        await execution.checkpoint();
        temporary = await mkdtemp(join(config.projectsRoot, `.clone-${name}-`));
        const result = await runProcess('git', [
            'clone',
            '--progress',
            '--',
            url,
            temporary,
        ], {
            cwd: config.projectsRoot,
            signal: execution.signal,
            onOutput: execution.log,
            maxOutputChars: MAX_ERROR_CHARS,
            env: config.commandEnv,
        });

        execution.throwIfAborted();
        if (result.exitCode !== 0) {
            throw new ToolError('command_failed', `git clone failed: ${result.stderr.trim()}`);
        }

        const branch = (await runGit(config, temporary, [
            'branch',
            '--show-current',
        ], execution)).trim();

        await execution.checkpoint();
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
                signal: execution.signal,
                onOutput: execution.log,
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
            await notePublication(temporary, name, execution);
        }

        execution.throwIfAborted();

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

export type CloneCommandResult = Awaited<ReturnType<typeof cloneCommand>>;
