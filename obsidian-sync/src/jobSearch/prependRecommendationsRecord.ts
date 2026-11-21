import { readFile } from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';

import { JOB_SEARCH_RECOMMENDATIONS_LOG_PATH } from '../vaultPaths';

import { insertRecordAfterHeader } from './insertRecordAfterHeader';

/**
 * Adds a record at the top of the LLM Recommendations Log. The note must exist: its header is
 * written by hand. It takes the same per-file lock as the vault tools, so it cannot race with
 * an edit through the Obsidian MCP.
 */
export async function prependRecommendationsRecord(heading: string, text: string): Promise<void> {
    await withFileMutation(JOB_SEARCH_RECOMMENDATIONS_LOG_PATH, async () => {
        const content = await readFile(JOB_SEARCH_RECOMMENDATIONS_LOG_PATH, 'utf8');

        await replaceFileAtomically(JOB_SEARCH_RECOMMENDATIONS_LOG_PATH, insertRecordAfterHeader(content, heading, text));
    }, createCommandExecution());
}
