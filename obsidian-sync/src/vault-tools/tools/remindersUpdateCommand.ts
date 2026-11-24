import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { todayIsoDay } from 'senaev-utils/src/obsidianReminders/isoDay';
import {
    findReminderEditBlocker, findReminderFieldsError, parseReminderLine, serializeReminder, type ReminderFields,
} from 'senaev-utils/src/obsidianReminders/reminderLine';
import { getNextRecurrenceDueDate } from 'senaev-utils/src/obsidianReminders/reminderRecurrence';
import { REMINDERS_TIME_ZONE } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { findRawBlocks, isLineInRawBlock } from '../markdown/rawBlocks';
import {
    countLines, getLine, readWrittenReminder, replaceLine,
} from '../reminders/reminderFileEdits';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type RemindersUpdateCommandInput = {
    path: string;
    line: number;
    expectedHash: string;
    changes: Partial<ReminderFields>;
};

function readEditableReminder(content: string, line: number): ReminderFields {
    const raw = getLine(content, line);

    if (raw === undefined) {
        throw invalidArguments(`Line ${line} does not exist: the note has ${countLines(content)} lines`);
    }

    const parsed = parseReminderLine(raw);

    if (parsed === null || isLineInRawBlock(findRawBlocks(content), line)) {
        throw new CommandError('invalid_arguments', `Line ${line} is not a reminder`, { actual: raw });
    }

    if (!parsed.ok) {
        throw new CommandError('invalid_arguments', `The reminder on line ${line} cannot be read: ${parsed.error}`, { actual: raw });
    }

    const blocker = findReminderEditBlocker(raw, parsed);

    if (blocker !== null) {
        throw new CommandError('invalid_arguments', blocker.reason, {
            expected: blocker.expected,
            actual: blocker.actual,
        });
    }

    return parsed.reminder;
}

/** The new fields: a closed reminder always has a closed date, an open reminder never has one. */
function applyChanges(current: ReminderFields, changes: Partial<ReminderFields>): ReminderFields {
    const next = {
        ...current,
        ...changes,
    };

    if (next.status === 'open') {
        if (changes.closedDate !== undefined && changes.closedDate !== null) {
            throw invalidArguments('"closedDate" can be set only for a done or cancelled reminder');
        }

        return {
            ...next,
            closedDate: null,
        };
    }

    const isNewlyClosed = current.status !== next.status && changes.closedDate === undefined;

    return {
        ...next,
        closedDate: isNewlyClosed || next.closedDate === null ? todayIsoDay(REMINDERS_TIME_ZONE) : next.closedDate,
    };
}

/** The open reminder that follows a completed recurring reminder, as the Tasks plugin adds it. */
function getNextOccurrence(current: ReminderFields, next: ReminderFields): ReminderFields | null {
    if (current.status === 'done' || next.status !== 'done' || next.recurrence === null) {
        return null;
    }

    if (next.date === null || next.closedDate === null) {
        throw invalidArguments('A recurring reminder needs "date" to be completed');
    }

    return {
        ...next,
        status: 'open',
        closedDate: null,
        date: getNextRecurrenceDueDate({
            recurrence: next.recurrence,
            date: next.date,
            completedOn: next.closedDate,
        }),
    };
}

/** Changes the fields of one reminder line; completing a recurring reminder adds the next one below. */
export async function remindersUpdateCommand(config: VaultToolsConfig, input: RemindersUpdateCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const {
        line, expectedHash, changes,
    } = input;

    return await withFileMutation(join(config.root, path), async () => {
        const absolutePath = await resolveExistingNote(config, path, execution);
        const original = await readTextFile(absolutePath, execution);

        assertExpectedHash(original, expectedHash, 'note');

        const current = readEditableReminder(original, line);
        const next = applyChanges(current, changes);
        const fieldsError = findReminderFieldsError(next);

        if (fieldsError !== null) {
            throw invalidArguments(fieldsError);
        }

        const nextOccurrence = getNextOccurrence(current, next);
        const updated = replaceLine(original, line, [
            serializeReminder(next),
            ...nextOccurrence === null ? [] : [serializeReminder(nextOccurrence)],
        ]);
        const isChanged = updated !== original;
        const diff = await createFileDiffAsync(path, original, updated, execution);

        if (isChanged) {
            assertExpectedHash(await readTextFile(absolutePath, execution), expectedHash, 'note');
            await replaceFileAtomically(absolutePath, updated, execution.signal, () => execution.changedPath(path));
        }

        const hash = hashContent(updated);

        return {
            path,
            hash,
            changed: isChanged,
            reminder: readWrittenReminder(path, hash, updated, line),
            nextOccurrence: nextOccurrence === null ? null : readWrittenReminder(path, hash, updated, line + 1),
            ...diff,
        };
    }, execution);
}

export type RemindersUpdateCommandResult = Awaited<ReturnType<typeof remindersUpdateCommand>>;
