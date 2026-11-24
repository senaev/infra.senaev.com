import { join } from 'node:path';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readTextFile } from 'senaev-utils/src/files/readTextFile';
import { hashContent } from 'senaev-utils/src/files/contentHash';
import { isReminderPathExcluded } from 'senaev-utils/src/obsidianReminders/dailyReminderList';
import type { ReminderFields } from 'senaev-utils/src/obsidianReminders/reminderLine';
import { stringifyUnknownError } from 'senaev-utils/src/utils/Error/stringifyUnknownError/stringifyUnknownError';

import { isNotePath } from '../access/vaultAccess';
import { type PathError, walkVault } from '../access/walkVault';
import { matchesNoteScope, type NoteScope } from '../noteScope';
import type { VaultToolsConfig } from '../vaultToolsConfig';

import { findReminderLines, type ReminderLine } from './findReminderLines';

/** A reminder as the tools return it: where it is, its line as written, and its fields. */
export type VaultReminder = {
    path: string;
    line: number;
    /** The hash of the whole file, for `expectedHash` of the reminder write tools. */
    hash: string;
    raw: string;
} & ReminderFields;

export type ReminderParseError = {
    path: string;
    line: number;
    raw: string;
    error: string;
};

export function toVaultReminder(path: string, hash: string, reminderLine: ReminderLine & { reminder: ReminderFields }): VaultReminder {
    return {
        path,
        line: reminderLine.line,
        hash,
        raw: reminderLine.raw,
        ...reminderLine.reminder,
    };
}

/** Every reminder of the notes in scope. A reminder line that cannot be read is reported, not listed. */
export async function scanVaultReminders(config: VaultToolsConfig, scope: NoteScope, execution: CommandExecution) {
    const walk = await walkVault(config, scope.folder, execution);
    const paths = walk.files.filter((path) => isNotePath(config, path) && !isReminderPathExcluded(path) && matchesNoteScope(config, scope, path));
    const reminders: VaultReminder[] = [];
    const parseErrors: ReminderParseError[] = [];
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

        const reminderLines = findReminderLines(content);
        const hash = reminderLines.length === 0 ? '' : hashContent(content);

        for (const reminderLine of reminderLines) {
            if (reminderLine.parsed.ok) {
                reminders.push(toVaultReminder(path, hash, {
                    ...reminderLine,
                    reminder: reminderLine.parsed.reminder,
                }));
            } else {
                parseErrors.push({
                    path,
                    line: reminderLine.line,
                    raw: reminderLine.raw,
                    error: reminderLine.parsed.error,
                });
            }
        }
    }

    return {
        reminders,
        parseErrors,
        scannedFiles: paths.length,
        readErrors,
        walkErrors: walk.errors,
    };
}
