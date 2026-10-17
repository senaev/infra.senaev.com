import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import {
    findTaskFieldsError, serializeTask, type TaskFields,
} from 'senaev-utils/src/obsidianTasks/taskLine';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import {
    assertTaskInsertPosition, insertLines, readWrittenTask,
} from '../tasks/taskFileEdits';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type TasksCreateCommandInput = {
    path: string;
    expectedHash: string;
    afterLine: number;
    blankLinesBefore: number;
    blankLinesAfter: number;
    task: TaskFields;
};

/** Writes one new task line into an existing note, after the given line. */
export async function tasksCreateCommand(config: VaultToolsConfig, input: TasksCreateCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const {
        expectedHash, afterLine, task,
    } = input;
    const fieldsError = findTaskFieldsError(task);

    if (fieldsError !== null) {
        throw invalidArguments(fieldsError);
    }

    return await withFileMutation(join(config.root, path), async () => {
        const absolutePath = await resolveExistingNote(config, path, execution);
        const original = await readTextFile(absolutePath, execution);

        assertExpectedHash(original, expectedHash, 'note');
        assertTaskInsertPosition(original, afterLine);

        const { content: updated, firstInsertedLine: taskLine } = insertLines(original, {
            ...input,
            lines: [serializeTask(task)],
        });
        const diff = await createFileDiffAsync(path, original, updated, execution);

        assertExpectedHash(await readTextFile(absolutePath, execution), expectedHash, 'note');
        await replaceFileAtomically(absolutePath, updated, execution.signal, () => execution.changedPath(path));

        const hash = hashContent(updated);

        return {
            path,
            hash,
            task: readWrittenTask(path, hash, updated, taskLine),
            nextOccurrence: null,
            ...diff,
        };
    }, execution);
}

export type TasksCreateCommandResult = Awaited<ReturnType<typeof tasksCreateCommand>>;
