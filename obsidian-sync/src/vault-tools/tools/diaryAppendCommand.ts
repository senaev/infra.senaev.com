import { join } from 'node:path';
import { appendFile } from 'node:fs/promises';

import type { CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { readOperationTextFile } from 'senaev-utils/src/toolServer/readOperationTextFile';
import { isNotFoundError } from 'senaev-utils/src/utils/Error/isNotFoundError/isNotFoundError';
import { createFileDiffAsync } from 'senaev-utils/src/toolServer/createFileDiffAsync';
import { withFileMutation } from 'senaev-utils/src/toolServer/withFileMutation';
import { ToolError } from 'senaev-utils/src/toolServer/ToolError';

import { formatDailyNoteDraftRecord } from '../../daily-note-draft/formatDailyNoteDraftRecord';
import { prepareNewNote, resolveExistingNote } from '../access/vaultAccess';
import type { VaultToolsConfig } from '../vaultToolsConfig';

async function resolveDraft(config: VaultToolsConfig, execution: CommandExecution): Promise<string> {
    try {
        return await resolveExistingNote(config, config.diaryDraftPath, execution);
    } catch (error) {
        execution.throwIfAborted();
        if (error instanceof ToolError && error.code === 'not_found') {
            return prepareNewNote(config, config.diaryDraftPath, execution);
        }

        throw error;
    }
}

export type DiaryAppendCommandInput = {
    text: string;
};

/**
 * Appends the text as a new timestamped record to the diary draft. A blind append on
 * purpose, unlike obsidian-patch: a record never changes existing text, so it needs no hash.
 */
export async function diaryAppendCommand(config: VaultToolsConfig, input: DiaryAppendCommandInput, execution: CommandExecution) {
    execution.throwIfAborted();
    const { text } = input;

    return await withFileMutation(join(config.root, config.diaryDraftPath), async () => {
        const absolutePath = await resolveDraft(config, execution);
        const before = await readOperationTextFile(absolutePath, execution).catch((error: unknown) => {
            execution.throwIfAborted();
            if (isNotFoundError(error)) {
                return '';
            }

            throw error;
        });
        const record = formatDailyNoteDraftRecord(text, new Date());

        const diff = await createFileDiffAsync(config.diaryDraftPath, before, `${before}${record}`, execution);

        await execution.checkpoint();
        await appendFile(absolutePath, record, 'utf8');
        execution.changedPath(config.diaryDraftPath);

        return {
            path: config.diaryDraftPath,
            ...diff,
        };
    }, execution);
}

export type DiaryAppendCommandResult = Awaited<ReturnType<typeof diaryAppendCommand>>;
