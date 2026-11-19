import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { CommandError } from 'senaev-utils/src/commands/CommandError';
import { createFileDiffAsync } from 'senaev-utils/src/files/createFileDiffAsync';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { withFileMutations } from 'senaev-utils/src/files/withFileMutation';
import { dailyNotePath, initializeDailyNote } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { formatDiaryRecord, insertDiaryRecord } from 'senaev-utils/src/obsidianDailyNotes/diaryRecord';
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
    records: number;
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
 * Reads the daily note of the day (or starts it from the template when it is missing or
 * blank) and inserts the records of that day into it, in memory.
 */
async function planNote(
    config: VaultToolsConfig,
    path: string,
    records: readonly string[],
    execution: CommandExecution
): Promise<PlannedNote> {
    const existing = await findExistingNote(config, path, execution);
    const before = existing === undefined ? '' : await readTextFile(existing, execution);
    let after = initializeDailyNote(path, before);

    if (after === before && before.trim() === '') {
        throw new CommandError('command_failed', `Could not create the daily note "${path}" from the template`);
    }

    for (const record of records) {
        after = insertDiaryRecord(after, record, path);
    }

    return {
        path,
        absolutePath: existing,
        before,
        after,
        records: records.length,
    };
}

async function writeNote(config: VaultToolsConfig, note: PlannedNote, execution: CommandExecution): Promise<void> {
    const published = () => execution.changedPath(note.path);

    if (note.absolutePath !== undefined) {
        await replaceFileAtomically(note.absolutePath, note.after, execution.signal, published);

        return;
    }

    // The folders of a new note are created only now, after every note of the call is ready.
    const absolutePath = await prepareNewNote(config, note.path, execution);

    await createFileExclusively(absolutePath, note.after, execution.signal, published).catch((error: unknown) => {
        execution.throwIfAborted();
        if (isAlreadyExistsError(error)) {
            throw new CommandError('conflict', `The daily note "${note.path}" was created by someone else meanwhile; nothing was written to it, retry`);
        }

        throw error;
    });
}

/**
 * Writes each diary record straight into the daily note of its day: right above the
 * `⬆️ Daily Note ⬆️` line, else right above the `![[daily_note_stream]]` line. A missing
 * daily note is created from the same template as the Obsidian plugin uses.
 *
 * Every note is prepared in memory first, so a note without a place for the records, or any
 * other expected error, fails the whole call before anything is written. A blind insert on
 * purpose, unlike obsidian-patch: a record never changes existing text, so it needs no hash.
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

        const results = [];

        for (const note of notes) {
            results.push({
                path: note.path,
                created: note.absolutePath === undefined,
                records: note.records,
                ...await createFileDiffAsync(note.path, note.before, note.after, execution),
            });
        }

        await execution.checkpoint();

        for (const note of notes) {
            await writeNote(config, note, execution);
        }

        return { notes: results };
    }, execution);
}

export type DiaryAppendCommandResult = Awaited<ReturnType<typeof diaryAppendCommand>>;
