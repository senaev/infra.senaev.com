import { appendFile, readFile } from 'node:fs/promises';

import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { createFileDiff } from 'senaev-utils/src/toolServer/createFileDiff';
import { requiredNonEmptyString } from 'senaev-utils/src/toolServer/toolArguments';
import { invalidArguments, ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { formatDailyNoteDraftRecord } from '../../daily-note-draft/formatDailyNoteDraftRecord';
import { prepareNewNote, resolveExistingNote } from '../access/vaultAccess';
import { readVaultToolArguments } from '../toolArguments';
import type { VaultToolsConfig } from '../vaultToolsConfig';

async function resolveDraft(config: VaultToolsConfig): Promise<string> {
    try {
        return await resolveExistingNote(config, config.diaryDraftPath);
    } catch (error) {
        if (error instanceof ToolError && error.code === 'not_found') {
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
        ...createFileDiff(config.diaryDraftPath, before, `${before}${record}`),
    };
}
