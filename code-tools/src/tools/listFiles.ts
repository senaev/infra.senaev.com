import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';

import { runProcess } from '../process/runProcess';

import type { CodeToolsConfig } from './codeToolsConfig';

const MAX_RG_OUTPUT_CHARS = 20_000_000;

/**
 * The files under `folder` that code-search also sees: hidden files too, without .git, and
 * in a git repository without the files that .gitignore hides. Sorted, relative to `folder`.
 */
export async function listFiles(config: CodeToolsConfig, folder: string, execution: CommandExecution): Promise<string[]> {
    execution.throwIfAborted();
    const result = await runProcess('rg', [
        '--files',
        '--null',
        '--no-config',
        '--hidden',
        '--glob',
        '!.git',
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

    // Exit code 1 means that there are no files; 2 is an error, for example an unreadable folder.
    if (result.exitCode === 2 && result.stdout === '') {
        throw new CommandError('command_failed', `ripgrep failed: ${result.stderr.trim().slice(0, 2000)}`);
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

    return files.sort();
}
