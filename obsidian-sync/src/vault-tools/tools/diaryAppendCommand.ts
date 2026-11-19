import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { withFileMutations } from 'senaev-utils/src/files/withFileMutation';
import { dailyNotePath, initializeDailyNote } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { formatDiaryRecord, insertDiaryRecords } from 'senaev-utils/src/obsidianDailyNotes/diaryRecord';
import { createFileExclusively, replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';
import { isAlreadyExistsError } from 'senaev-utils/src/utils/Error/isAlreadyExistsError/isAlreadyExistsError';

import { prepareNewNote, resolveExistingNote } from '../access/vaultAccess';
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

/**
 * The daily note with the records of the day inserted, in memory. A blank note is first filled
 * from the template, as the Obsidian plugin does.
 */
function buildNote(path: string, content: string, records: readonly string[]): string {
    const initialized = initializeDailyNote(path, content);

    if (initialized === content && content.trim() === '') {
        throw new CommandError('command_failed', `Could not create the daily note "${path}" from the template`);
    }

    return insertDiaryRecords(initialized, records, path);
}

/** Reads the daily note of the day, or starts it from the template when it is missing. */
async function planNote(
    config: VaultToolsConfig,
    path: string,
    records: readonly string[],
    execution: CommandExecution
): Promise<PlannedNote> {
    const existing = await findExistingNote(config, path, execution);
    const before = existing === undefined ? '' : await readTextFile(existing, execution);

    return {
        path,
        absolutePath: existing,
        before,
        after: buildNote(path, before, records),
        records,
    };
}

/** Rebuilds an existing note this many times when it keeps changing under the call. */
const MAX_WRITE_ATTEMPTS = 3;

/**
 * Writes the planned note. An existing note is read again right before it is replaced: when
 * Obsidian or anything else changed it since the plan, the records are inserted into the
 * current content instead, so that change is kept. Nothing yields to other work of this
 * process between that read and the replacement; only the file system time of the write
 * itself (a few milliseconds) stays unprotected against another process, as for every
 * other vault write.
 */
async function writeNote(config: VaultToolsConfig, note: PlannedNote, execution: CommandExecution) {
    const published = () => execution.changedPath(note.path);
    const result = async (written: PlannedNote) => {
        return {
            path: written.path,
            created: written.absolutePath === undefined,
            records: written.records.length,
            ...await createFileDiffAsync(written.path, written.before, written.after, execution),
        };
    };

    if (note.absolutePath !== undefined) {
        const { absolutePath } = note;
        let written = note;

        for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
            const diff = await result(written);

            await execution.checkpoint();
            const current = await readFile(absolutePath, {
                encoding: 'utf8',
                signal: execution.signal,
            });

            if (current === written.before) {
                await replaceFileAtomically(absolutePath, written.after, execution.signal, published);

                return diff;
            }

            written = {
                ...written,
                before: current,
                after: buildNote(note.path, current, note.records),
            };
        }

        throw new CommandError('conflict', `The daily note "${note.path}" kept changing while the diary records were written; nothing was written to it, retry`);
    }

    const diff = await result(note);
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
 * Writes each diary record straight into the daily note of its day: right above the
 * `⬆️ Daily Note ⬆️` line, else right above the `![[daily_note_stream]]` line. A missing
 * daily note is created from the same template as the Obsidian plugin uses.
 *
 * Every note is prepared in memory first, so a note without a place for the records, or any
 * other expected error, fails the whole call before anything is written. A blind insert on
 * purpose, unlike obsidian-patch: a record never changes existing text, so it needs no hash.
 * Cancelled while writing, it can leave the records in only some of the notes.
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

        for (const path of paths) {
            await execution.checkpoint();
            notes.push(await planNote(config, path, recordsByPath.get(path) ?? [], execution));
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
