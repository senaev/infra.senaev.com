import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';

import { insertLines } from '../vault-tools/tasks/taskFileEdits';
import { TASKS_FILE_PATH } from '../vaultPaths';

async function readOrEmpty(path: string): Promise<string> {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (isNotFoundError(error)) {
            return '';
        }

        throw error;
    }
}

/**
 * Puts `line` at the very top of the tasks file, separated from the rest by a blank line,
 * creating the file (and folders) if needed. It takes the same per-file lock as the vault
 * tools, so it cannot race with obsidian-tasks_create on the same file.
 */
export async function prependTaskLine(line: string): Promise<void> {
    await withFileMutation(TASKS_FILE_PATH, async () => {
        await mkdir(dirname(TASKS_FILE_PATH), { recursive: true });

        const { content } = insertLines(await readOrEmpty(TASKS_FILE_PATH), {
            afterLine: 0,
            blankLinesBefore: 0,
            blankLinesAfter: 1,
            lines: [line],
        });

        await replaceFileAtomically(TASKS_FILE_PATH, content);
    }, createCommandExecution());
}
