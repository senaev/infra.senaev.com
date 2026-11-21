import { readFile } from 'node:fs/promises';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import { withFileMutation } from 'senaev-utils/src/files/withFileMutation';
import { replaceFileAtomically } from 'senaev-utils/src/utils/fs/atomicFileWrite/atomicFileWrite';

import { JOB_SEARCH_RECOMMENDATIONS_LOG_PATH } from '../vaultPaths';

import { hasRecord, insertRecordAfterHeader } from './insertRecordAfterHeader';

/**
 * Adds a record at the top of the LLM Recommendations Log. The note must exist: its header is
 * written by hand. It takes the same per-file lock as the vault tools, so it cannot race with
 * an edit through the Obsidian MCP. Returns false when a record with this heading is already
 * there: n8n retries a request whose answer was lost after the write.
 */
export async function prependRecommendationsRecord(heading: string, text: string): Promise<boolean> {
    return await withFileMutation(JOB_SEARCH_RECOMMENDATIONS_LOG_PATH, async () => {
        const content = await readFile(JOB_SEARCH_RECOMMENDATIONS_LOG_PATH, 'utf8');

        if (hasRecord(content, heading)) {
            return false;
        }

        await replaceFileAtomically(JOB_SEARCH_RECOMMENDATIONS_LOG_PATH, insertRecordAfterHeader(content, heading, text));

        return true;
    }, createCommandExecution());
}
