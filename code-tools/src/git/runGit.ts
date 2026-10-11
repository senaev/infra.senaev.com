import {
    operationCheckpoint, operationContext, throwIfOperationAborted,
} from 'senaev-utils/src/operations/operationContext';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { type ProcessResult, runProcess } from '../process/runProcess';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

const MAX_GIT_OUTPUT_CHARS = 20_000_000;

/** Runs a git command that is part of a tool, and fails with git's own message. */
export async function runGit(config: CodeToolsConfig, cwd: string, args: readonly string[]): Promise<string> {
    throwIfOperationAborted();
    const context = operationContext();
    const result = await runProcess('git', args, {
        cwd,
        ...context && {
            signal: context.signal,
            onOutput: context.log,
        },
        maxOutputChars: MAX_GIT_OUTPUT_CHARS,
        keep: 'start',
        env: config.commandEnv,
    });

    throwIfOperationAborted();
    if (result.exitCode !== 0 || result.outputTruncated) {
        throw new ToolError('command_failed', `git ${args[0] ?? ''} failed: ${describeGitFailure(result)}`);
    }

    return result.stdout;
}

function describeGitFailure(result: ProcessResult): string {
    if (result.timedOut) {
        return 'timed out';
    }

    if (result.outputTruncated) {
        return 'printed too much';
    }

    return result.stderr.trim();
}

/**
 * The files git shows: tracked ones that still exist, and untracked ones that .gitignore
 * does not hide. Sorted, project-relative, with "/" separators.
 */
export async function listProjectFiles(config: CodeToolsConfig, root: string): Promise<string[]> {
    const results = await Promise.allSettled([
        runGit(config, root, [
            'ls-files',
            '-z',
            '--cached',
            '--others',
            '--exclude-standard',
        ]),
        runGit(config, root, [
            'ls-files',
            '-z',
            '--deleted',
        ]),
    ]);

    throwIfOperationAborted();
    const output = results.map((result) => {
        if (result.status === 'rejected') {
            throw result.reason;
        }

        return result.value;
    });
    const deletedFiles = new Set((output[1] ?? '').split('\0'));
    const files = new Set<string>();
    let index = 0;

    for (const file of (output[0] ?? '').split('\0')) {
        if (index++ % 128 === 0) {
            await operationCheckpoint();
        }

        if (file !== '' && !deletedFiles.has(file)) {
            files.add(file);
        }
    }

    throwIfOperationAborted();

    return [...files].sort();
}
