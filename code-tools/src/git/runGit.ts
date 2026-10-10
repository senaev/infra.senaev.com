import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { type ProcessResult, runProcess } from '../process/runProcess';
import type { CodeToolsConfig } from '../tools/codeToolsConfig';

const GIT_TIMEOUT_MS = 30_000;
const MAX_GIT_OUTPUT_CHARS = 20_000_000;

/** Runs a git command that is part of a tool, and fails with git's own message. */
export async function runGit(config: CodeToolsConfig, cwd: string, args: readonly string[]): Promise<string> {
    const result = await runProcess('git', args, {
        cwd,
        timeoutMs: GIT_TIMEOUT_MS,
        maxOutputChars: MAX_GIT_OUTPUT_CHARS,
        keep: 'start',
        env: config.commandEnv,
    });

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
    const [
        listed,
        deleted,
    ] = await Promise.all([
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
    const deletedFiles = new Set(deleted.split('\0'));
    const files = new Set(listed.split('\0').filter((file) => file !== '' && !deletedFiles.has(file)));

    return [...files].sort();
}
