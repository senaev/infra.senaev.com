import { join } from 'node:path';
import { appendFile } from 'node:fs/promises';

import { readOperationTextFile } from 'senaev-utils/src/toolServer/readOperationTextFile';
import {
    operationCheckpoint, recordChangedPath, throwIfOperationAborted,
} from 'senaev-utils/src/operations/operationContext';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/toolServer/withFileMutation';
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
        throwIfOperationAborted();
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

    return await withFileMutation(join(config.root, config.diaryDraftPath), async () => {
        const absolutePath = await resolveDraft(config);
        const before = await readOperationTextFile(absolutePath).catch((error: unknown) => {
            throwIfOperationAborted();
            if (isNotFoundError(error)) {
                return '';
            }

            throw error;
        });
        const record = formatDailyNoteDraftRecord(text, new Date());

        const diff = await createFileDiffAsync(config.diaryDraftPath, before, `${before}${record}`);

        await operationCheckpoint();
        await appendFile(absolutePath, record, 'utf8');
        recordChangedPath(config.diaryDraftPath);

        return {
            path: config.diaryDraftPath,
            ...diff,
        };
    });
}
