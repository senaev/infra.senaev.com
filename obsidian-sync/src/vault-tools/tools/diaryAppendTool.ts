import { appendFile } from 'node:fs/promises';

import { formatDailyNoteDraftRecord } from '../../daily-note-draft/formatDailyNoteDraftRecord';
import { prepareNewNote, resolveExistingNote } from '../access/vaultAccess';
import { readToolArguments, requiredNonEmptyString } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';
import { invalidArguments, VaultToolError } from '../VaultToolError';

async function resolveDraft(config: VaultToolsConfig): Promise<string> {
    try {
        return await resolveExistingNote(config, config.diaryDraftPath);
    } catch (error) {
        if (error instanceof VaultToolError && error.code === 'not_found') {
            return prepareNewNote(config, config.diaryDraftPath);
        }

        throw error;
    }
}

/**
 * Appends the text as a new timestamped record to the diary draft. A blind append on
 * purpose, unlike obsidian-patch: a record never changes existing text, so it needs no hash.
 */
export async function diaryAppendTool(config: VaultToolsConfig, input: unknown) {
    const args = readToolArguments(input, ['text']);
    const text = requiredNonEmptyString(args, 'text').trim();

    if (text === '') {
        throw invalidArguments('"text" must not be blank');
    }

    await appendFile(await resolveDraft(config), formatDailyNoteDraftRecord(text, new Date()), 'utf8');

    return { path: config.diaryDraftPath };
}
