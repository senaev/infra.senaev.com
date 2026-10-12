import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';

import { type ProcessResult, runProcess } from '../process/runProcess';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

const MAX_GIT_OUTPUT_CHARS = 20_000_000;

/** Runs a git command that is part of a tool, and fails with git's own message. */
export async function runGit(config: CodeToolsConfig, cwd: string, args: readonly string[], execution: CommandExecution): Promise<string> {
    execution.throwIfAborted();
    const result = await runProcess('git', args, {
        cwd,
        signal: execution.signal,
        onOutput: execution.log,
        maxOutputChars: MAX_GIT_OUTPUT_CHARS,
        keep: 'start',
        env: config.commandEnv,
    });

    execution.throwIfAborted();
    if (result.exitCode !== 0 || result.outputTruncated) {
        throw new CommandError('command_failed', `git ${args[0] ?? ''} failed: ${describeGitFailure(result)}`);
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
export async function listProjectFiles(config: CodeToolsConfig, root: string, execution: CommandExecution): Promise<string[]> {
    const results = await Promise.allSettled([
        runGit(config, root, [
            'ls-files',
            '-z',
            '--cached',
            '--others',
            '--exclude-standard',
        ], execution),
        runGit(config, root, [
            'ls-files',
            '-z',
            '--deleted',
        ], execution),
    ]);

    execution.throwIfAborted();
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
            await execution.checkpoint();
        }

        if (file !== '' && !deletedFiles.has(file)) {
            files.add(file);
        }
    }

    execution.throwIfAborted();

    return [...files].sort();
}
