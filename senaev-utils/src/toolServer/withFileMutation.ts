import { operationCheckpoint } from '../operations/operationContext';

import { ToolError } from './ToolError';

// A mutation reserves one path, not an execution slot. Conflicting parallel edits fail
// rather than both validating an old hash and silently losing one of the changes.
// External writers/replicas are outside this process-local reservation.
const reserved = new Set<string>();

export async function withFileMutation<T>(path: string, run: () => Promise<T>): Promise<T> {
    await operationCheckpoint();
    if (reserved.has(path)) {
        throw new ToolError('conflict', 'Another mutation of this file is in progress');
    }

    reserved.add(path);
    try {
        return await run();
    } finally {
        reserved.delete(path);
    }
}
