import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';

import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';

const MAX_RG_OUTPUT_CHARS = 20_000_000;

/** The ripgrep flags that choose the files for both code-list and code-search. */
export const RIPGREP_FILE_SELECTION_ARGS = [
    '--no-config',
    // Dotfiles such as .github are code too; .gitignore still applies.
    '--hidden',
    '--glob',
    '!.git',
] as const;

export type ListedFiles = {
    /** Sorted, relative to the folder. */
    files: string[];
    /** Set when ripgrep could not read a part of the folder, so `files` is incomplete. */
    warnings?: string;
};

/**
 * The files under `folder` at any depth, as code-search sees them: in a git repository
 * without the files that .gitignore hides. Symbolic links are not followed or listed.
 */
export async function listFiles(config: CodeToolsConfig, folder: string, execution: CommandExecution): Promise<ListedFiles> {
    execution.throwIfAborted();
    const result = await runProcess('rg', [
        '--files',
        '--null',
        ...RIPGREP_FILE_SELECTION_ARGS,
    ], {
        cwd: folder,
        signal: execution.signal,
        onOutput: execution.log,
        maxOutputChars: MAX_RG_OUTPUT_CHARS,
        keep: 'start',
        env: config.commandEnv,
    });

    execution.throwIfAborted();
    if (result.outputTruncated) {
        throw new CommandError('command_failed', `"${folder}" has too many files; list a smaller folder`);
    }

    const stderr = result.stderr.trim().slice(0, 2000);

    // Exit code 1 means that there are no files; 2 means an error, for example an unreadable subfolder.
    if (result.exitCode === null || (result.exitCode === 2 && result.stdout === '')) {
        throw new CommandError('command_failed', `ripgrep failed: ${stderr || `stopped by ${result.signal ?? 'a signal'}`}`);
    }

    const files: string[] = [];
    let index = 0;

    for (const file of result.stdout.split('\0')) {
        if (index++ % 128 === 0) {
            await execution.checkpoint();
        }

        if (file !== '') {
            files.push(file);
        }
    }

    execution.throwIfAborted();

    return {
        files: files.sort(),
        ...result.exitCode === 2 && { warnings: stderr },
    };
}
