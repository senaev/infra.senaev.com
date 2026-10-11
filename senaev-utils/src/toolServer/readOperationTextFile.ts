import { readFile } from 'node:fs/promises';

import {
    operationCheckpoint, operationContext, throwIfOperationAborted,
} from '../operations/operationContext';

/** Reads text under the current operation, without swallowing cancellation as a path error. */
export async function readOperationTextFile(path: string): Promise<string> {
    await operationCheckpoint();
    const signal = operationContext()?.signal;
    const content = await readFile(path, {
        encoding: 'utf8',
        ...signal === undefined ? {} : { signal },
    });

    throwIfOperationAborted();

    return content;
}
