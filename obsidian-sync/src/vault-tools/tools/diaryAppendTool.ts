import { appendFile, readFile } from 'node:fs/promises';

import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';

import { formatDailyNoteDraftRecord } from '../../daily-note-draft/formatDailyNoteDraftRecord';
import { prepareNewNote, resolveExistingNote } from '../access/vaultAccess';
import { createNoteDiff } from '../markdown/createNoteDiff';
import { readVaultToolArguments, requiredNonEmptyString } from '../toolArguments';
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
    const args = readVaultToolArguments(input, 'diary_append');
    const text = requiredNonEmptyString(args, 'text').trim();

    if (text === '') {
        throw invalidArguments('"text" must not be blank');
    }

    const absolutePath = await resolveDraft(config);
    const before = await readFile(absolutePath, 'utf8').catch((error: unknown) => {
        if (isNotFoundError(error)) {
            return '';
        }

        throw error;
    });
    const record = formatDailyNoteDraftRecord(text, new Date());

    await appendFile(absolutePath, record, 'utf8');

    return {
        path: config.diaryDraftPath,
        ...createNoteDiff(config.diaryDraftPath, before, `${before}${record}`),
    };
}
