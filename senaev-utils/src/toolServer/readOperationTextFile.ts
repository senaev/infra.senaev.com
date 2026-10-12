import { readFile } from 'node:fs/promises';

import type { CommandExecution } from '../commands/CommandExecution';

/** Read text using only the explicitly supplied cancellation capabilities. */
export async function readOperationTextFile(path: string, execution: CommandExecution): Promise<string> {
    await execution.checkpoint();
    try {
        const content = await readFile(path, {
            encoding: 'utf8',
            signal: execution.signal,
        });

        execution.throwIfAborted();

        return content;
    } catch (error) {
        execution.throwIfAborted();
        throw error;
    }
}
