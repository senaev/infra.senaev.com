import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { assertExpectedHash, hashContent } from 'senaev-utils/src/files/contentHash';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { todayIsoDay } from 'senaev-utils/src/obsidianTasks/isoDay';
import {
    findTaskEditBlocker, findTaskFieldsError, parseTaskLine, serializeTask, type TaskFields,
} from 'senaev-utils/src/obsidianTasks/taskLine';
import { getNextRecurrenceDueDate } from 'senaev-utils/src/obsidianTasks/taskRecurrence';
import { TASKS_TIME_ZONE } from 'senaev-utils/src/obsidianVaultTools/vaultToolLimits';
import { CommandError, invalidArguments } from 'senaev-utils/src/commands/CommandError';

import { normalizeVaultPath, resolveExistingNote } from '../access/vaultAccess';
import { findRawBlocks, isLineInRawBlock } from '../markdown/rawBlocks';
import {
    countLines, getLine, readWrittenTask, replaceLine,
} from '../tasks/taskFileEdits';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type TasksUpdateCommandInput = {
    path: string;
    line: number;
    expectedHash: string;
    changes: Partial<TaskFields>;
};

function readEditableTask(content: string, line: number): TaskFields {
    const raw = getLine(content, line);

    if (raw === undefined) {
        throw invalidArguments(`Line ${line} does not exist: the note has ${countLines(content)} lines`);
    }

    const parsed = parseTaskLine(raw);

    if (parsed === null || isLineInRawBlock(findRawBlocks(content), line)) {
        throw new CommandError('invalid_arguments', `Line ${line} is not a task`, { actual: raw });
    }

    if (!parsed.ok) {
        throw new CommandError('invalid_arguments', `The task on line ${line} cannot be read: ${parsed.error}`, { actual: raw });
    }

    const blocker = findTaskEditBlocker(raw, parsed);

    if (blocker !== null) {
        throw new CommandError('invalid_arguments', blocker.reason, {
            expected: blocker.expected,
            actual: blocker.actual,
        });
    }

    return parsed.task;
}

/** The new fields: a closed task always has a closed date, an open task never has one. */
function applyChanges(current: TaskFields, changes: Partial<TaskFields>): TaskFields {
    const next = {
        ...current,
        ...changes,
    };

    if (next.status === 'open') {
        if (changes.closedDate !== undefined && changes.closedDate !== null) {
            throw invalidArguments('"closedDate" can be set only for a done or cancelled task');
        }

        return {
            ...next,
            closedDate: null,
        };
    }

    const isNewlyClosed = current.status !== next.status && changes.closedDate === undefined;

    return {
        ...next,
        closedDate: isNewlyClosed || next.closedDate === null ? todayIsoDay(TASKS_TIME_ZONE) : next.closedDate,
    };
}

/** The open task that follows a completed recurring task, as the Tasks plugin adds it. */
function getNextOccurrence(current: TaskFields, next: TaskFields): TaskFields | null {
    if (current.status === 'done' || next.status !== 'done' || next.recurrence === null) {
        return null;
    }

    if (next.dueDate === null || next.closedDate === null) {
        throw invalidArguments('A recurring task needs "dueDate" to be completed');
    }

    return {
        ...next,
        status: 'open',
        closedDate: null,
        dueDate: getNextRecurrenceDueDate({
            recurrence: next.recurrence,
            dueDate: next.dueDate,
            completedOn: next.closedDate,
        }),
    };
}

/** Changes the fields of one task line; completing a recurring task adds the next one below. */
export async function tasksUpdateCommand(config: VaultToolsConfig, input: TasksUpdateCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const path = normalizeVaultPath(input.path, 'path');
    const {
        line, expectedHash, changes,
    } = input;

    return await withFileMutation(join(config.root, path), async () => {
        const absolutePath = await resolveExistingNote(config, path, execution);
        const original = await readTextFile(absolutePath, execution);

        assertExpectedHash(original, expectedHash, 'note');

        const current = readEditableTask(original, line);
        const next = applyChanges(current, changes);
        const fieldsError = findTaskFieldsError(next);

        if (fieldsError !== null) {
            throw invalidArguments(fieldsError);
        }

        const nextOccurrence = getNextOccurrence(current, next);
        const updated = replaceLine(original, line, [
            serializeTask(next),
            ...nextOccurrence === null ? [] : [serializeTask(nextOccurrence)],
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
            task: readWrittenTask(path, hash, updated, line),
            nextOccurrence: nextOccurrence === null ? null : readWrittenTask(path, hash, updated, line + 1),
            ...diff,
        };
    }, execution);
}

export type TasksUpdateCommandResult = Awaited<ReturnType<typeof tasksUpdateCommand>>;
