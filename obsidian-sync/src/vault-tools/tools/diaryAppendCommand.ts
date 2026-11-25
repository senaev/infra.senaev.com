import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { withFileMutations } from 'senaev-utils/src/files/withFileMutation';
import {
    hasReminder, type ReminderNote, type ReminderSource,
} from 'senaev-utils/src/obsidianDailyNotes/dailyReminders';
import { dailyNotePath, initializeDailyNote } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { formatDiaryRecord, insertDiaryRecords } from 'senaev-utils/src/obsidianDailyNotes/diaryRecord';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';

import { logger } from '../../logger';
import { parseNoteFrontmatter } from '../../markdown/parseNoteFrontmatter';
import {
    isNotePath, prepareNewNote, resolveExistingNote,
} from '../access/vaultAccess';
import { walkVault } from '../access/walkVault';
import type { VaultToolsConfig } from '../vaultToolsConfig';

export type DiaryRecordInput = {
    /** The day the record belongs to, `YYYY-MM-DD`. */
    date: string;
    text: string;
};

export type DiaryAppendCommandInput = {
    records: readonly DiaryRecordInput[];
};

type PlannedNote = {
    path: string;
    /** `undefined` for a note that does not exist yet. */
    absolutePath: string | undefined;
    before: string;
    after: string;
    records: readonly string[];
};

/** The absolute path of an existing daily note, or `undefined` when there is none yet. */
async function findExistingNote(config: VaultToolsConfig, path: string, execution: CommandExecution): Promise<string | undefined> {
    try {
        return await resolveExistingNote(config, path, execution);
    } catch (error) {
        execution.throwIfAborted();
        if (error instanceof CommandError && error.code === 'not_found') {
            return undefined;
        }

        throw error;
    }
}

async function readReminderSource(config: VaultToolsConfig, execution: CommandExecution): Promise<ReminderSource> {
    const { files, errors } = await walkVault(config, '', execution);
    const notePaths = files.filter((path) => isNotePath(config, path));
    const notes: ReminderNote[] = [];

    for (const { path } of errors) {
        logger.warn({ path }, 'Could not search folder for daily reminders');
    }

    for (const path of notePaths) {
        if (path.startsWith(`${config.diaryFolder}/`)) {
            continue;
        }

        await execution.checkpoint();
        try {
            const content = await readTextFile(join(config.root, path), execution);
            const frontmatter = parseNoteFrontmatter(content);

            if (frontmatter && hasReminder(frontmatter)) {
                notes.push({
                    path,
                    frontmatter,
                });
            }
        } catch {
            execution.throwIfAborted();
            logger.warn({ path }, 'Could not read frontmatter for daily reminders');
        }
    }

    return {
        notes,
        notePaths,
        onInvalidReminder: (path, property) => {
            logger.warn({
                path,
                property,
            }, 'Invalid daily reminder');
        },
    };
}

/** Reads the daily note of the day, or starts it from the template when it is missing. */
async function planNote(
    config: VaultToolsConfig,
    [
        path,
        records]: [string, readonly string[]
    ],
    execution: CommandExecution,
    loadReminders: () => Promise<ReminderSource>
): Promise<PlannedNote> {
    const existing = await findExistingNote(config, path, execution);
    const before = existing === undefined ? '' : await readTextFile(existing, execution);

    const scaffold = initializeDailyNote(path, before);
    const initialized = scaffold === before ? before : initializeDailyNote(path, before, await loadReminders());

    return {
        path,
        absolutePath: existing,
        before,
        after: insertDiaryRecords(initialized, records, path),
        records,
    };
}

/**
 * Writes the planned note. An existing note is read again right before it is replaced: when
 * Obsidian or anything else changed it since the plan, the call fails with `conflict` and
 * the note keeps that change. Nothing yields to other work of this process between that read
 * and the replacement; only the file system time of the write itself (a few milliseconds)
 * stays unprotected against another process, as for every other vault write.
 */
async function writeNote(config: VaultToolsConfig, note: PlannedNote, execution: CommandExecution) {
    const published = () => execution.changedPath(note.path);
    const result = async () => {
        return {
            path: note.path,
            created: note.absolutePath === undefined,
            records: note.records.length,
            ...await createFileDiffAsync(note.path, note.before, note.after, execution),
        };
    };

    if (note.absolutePath !== undefined) {
        const diff = await result();

        await execution.checkpoint();
        const current = await readFile(note.absolutePath, {
            encoding: 'utf8',
            signal: execution.signal,
        });

        if (current !== note.before) {
            throw new CommandError('conflict', `The daily note "${note.path}" changed while the diary records were written; nothing was written to it, retry`);
        }

        await replaceFileAtomically(note.absolutePath, note.after, execution.signal, published);

        return diff;
    }

    const diff = await result();
    // The folders of a new note are created only now, after every note of the call is ready.
    const absolutePath = await prepareNewNote(config, note.path, execution);

    await createFileExclusively(absolutePath, note.after, execution.signal, published).catch((error: unknown) => {
        execution.throwIfAborted();
        if (isAlreadyExistsError(error)) {
            throw new CommandError('conflict', `The daily note "${note.path}" was created by someone else meanwhile; nothing was written to it, retry`);
        }

        throw error;
    });

    return diff;
}

/**
 * Writes each diary record straight into the daily note of its day, right above the
 * `⬆️ Daily Note ⬆️` line. A missing
 * daily note is created from the same template as the Obsidian plugin uses.
 *
 * Every note is prepared in memory first, so a note without a place for the records, or any
 * other expected error, fails the whole call before anything is written. A blind insert on
 * purpose, unlike obsidian-patch: a record never changes existing text, so it needs no hash.
 * When a note changed after it was read, or the call is cancelled while writing, the
 * records can be left in only some of the notes.
 */
export async function diaryAppendCommand(config: VaultToolsConfig, input: DiaryAppendCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const now = new Date();

    // Records of one day keep their order; days keep the order of their first record.
    const recordsByPath = new Map<string, string[]>();

    for (const { date, text } of input.records) {
        const path = dailyNotePath(date);
        const records = recordsByPath.get(path) ?? [];

        records.push(formatDiaryRecord(date, text, now));
        recordsByPath.set(path, records);
    }

    const paths = [...recordsByPath.keys()];

    return await withFileMutations(paths.map((path) => join(config.root, path)), async () => {
        const notes: PlannedNote[] = [];
        let reminderSource: Promise<ReminderSource> | undefined;
        const loadReminders = () => {
            reminderSource ??= readReminderSource(config, execution);

            return reminderSource;
        };

        for (const path of paths) {
            await execution.checkpoint();
            notes.push(await planNote(config, [
                path,
                recordsByPath.get(path) ?? [],
            ], execution, loadReminders));
        }

        await execution.checkpoint();

        const results = [];

        for (const note of notes) {
            results.push(await writeNote(config, note, execution));
        }

        return { notes: results };
    }, execution);
}

export type DiaryAppendCommandResult = Awaited<ReturnType<typeof diaryAppendCommand>>;
