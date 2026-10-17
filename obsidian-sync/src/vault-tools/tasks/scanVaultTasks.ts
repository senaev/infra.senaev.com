import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import { isTaskPathExcluded } from 'senaev-utils/src/obsidianTasks/dailyTasks';
import type { TaskFields } from 'senaev-utils/src/obsidianTasks/taskLine';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { isNotePath } from '../access/vaultAccess';
import { type PathError, walkVault } from '../access/walkVault';
import { matchesNoteScope, type NoteScope } from '../noteScope';
import type { VaultToolsConfig } from '../vaultToolsConfig';

import { findTaskLines, type TaskLine } from './findTaskLines';

/** A task as the tools return it: where it is, its line as written, and its fields. */
export type VaultTask = {
    path: string;
    line: number;
    /** The hash of the whole file, for `expectedHash` of the task write tools. */
    hash: string;
    raw: string;
} & TaskFields;

export type TaskParseError = {
    path: string;
    line: number;
    raw: string;
    error: string;
};

export function toVaultTask(path: string, hash: string, taskLine: TaskLine & { task: TaskFields }): VaultTask {
    return {
        path,
        line: taskLine.line,
        hash,
        raw: taskLine.raw,
        ...taskLine.task,
    };
}

/** Every task of the notes in scope. A task line that cannot be read is reported, not listed. */
export async function scanVaultTasks(config: VaultToolsConfig, scope: NoteScope, execution: CommandExecution) {
    const walk = await walkVault(config, scope.folder, execution);
    const paths = walk.files.filter((path) => isNotePath(config, path) && !isTaskPathExcluded(path) && matchesNoteScope(config, scope, path));
    const tasks: VaultTask[] = [];
    const parseErrors: TaskParseError[] = [];
    const readErrors: PathError[] = [];

    for (const path of paths) {
        await execution.checkpoint();
        let content: string;

        try {
            content = await readTextFile(join(config.root, path), execution);
        } catch (error) {
            execution.throwIfAborted();
            readErrors.push({
                path,
                message: stringifyUnknownError(error),
            });
            continue;
        }

        const taskLines = findTaskLines(content);
        const hash = taskLines.length === 0 ? '' : hashContent(content);

        for (const taskLine of taskLines) {
            if (taskLine.parsed.ok) {
                tasks.push(toVaultTask(path, hash, {
                    ...taskLine,
                    task: taskLine.parsed.task,
                }));
            } else {
                parseErrors.push({
                    path,
                    line: taskLine.line,
                    raw: taskLine.raw,
                    error: taskLine.parsed.error,
                });
            }
        }
    }

    return {
        tasks,
        parseErrors,
        scannedFiles: paths.length,
        readErrors,
        walkErrors: walk.errors,
    };
}
