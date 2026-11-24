import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import {
    findReminderFieldsError, serializeReminder, type ReminderFields,
} from 'senaev-utils/src/obsidianReminders/reminderLine';
import { invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import {
    assertReminderInsertPosition, insertLines, readWrittenReminder,
} from '../reminders/reminderFileEdits';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type RemindersCreateCommandInput = {
    path: string;
    expectedHash: string;
    afterLine: number;
    blankLinesBefore: number;
    blankLinesAfter: number;
    reminder: ReminderFields;
};

/** Writes one new reminder line into an existing note, after the given line. */
export async function remindersCreateCommand(config: VaultToolsConfig, input: RemindersCreateCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const {
        expectedHash, afterLine, reminder,
    } = input;
    const fieldsError = findReminderFieldsError(reminder);

    if (fieldsError !== null) {
        throw invalidArguments(fieldsError);
    }

    return await withFileMutation(join(config.root, path), async () => {
        const absolutePath = await resolveExistingNote(config, path, execution);
        const original = await readTextFile(absolutePath, execution);

        assertExpectedHash(original, expectedHash, 'note');
        assertReminderInsertPosition(original, afterLine);

        const { content: updated, firstInsertedLine: reminderLine } = insertLines(original, {
            ...input,
            lines: [serializeReminder(reminder)],
        });
        const diff = await createFileDiffAsync(path, original, updated, execution);

        assertExpectedHash(await readTextFile(absolutePath, execution), expectedHash, 'note');
        await replaceFileAtomically(absolutePath, updated, execution.signal, () => execution.changedPath(path));

        const hash = hashContent(updated);

        return {
            path,
            hash,
            reminder: readWrittenReminder(path, hash, updated, reminderLine),
            nextOccurrence: null,
            ...diff,
        };
    }, execution);
}

export type RemindersCreateCommandResult = Awaited<ReturnType<typeof remindersCreateCommand>>;
