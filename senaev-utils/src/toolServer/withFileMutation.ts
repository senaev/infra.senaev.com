import type { CommandExecution } from '../commands/CommandExecution';

import { ToolError } from './ToolError';

// A mutation reserves one path, not an execution slot. Conflicting parallel edits fail
// rather than both validating an old hash and silently losing one of the changes.
// External writers/replicas are outside this process-local reservation.
const reserved = new Set<string>();

export async function withFileMutation<T>(path: string, run: () => Promise<T>, execution: CommandExecution): Promise<T> {
    return await withFileMutations([path], run, execution);
}

/** Reserve overlapping write sets without waiting or deadlocking parallel mutations. */
export async function withFileMutations<T>(paths: readonly string[], run: () => Promise<T>, execution: CommandExecution): Promise<T> {
    await execution.checkpoint();
    if (paths.some((path) => reserved.has(path))) {
        throw new ToolError('conflict', 'Another mutation of this file is in progress');
    }

    paths.forEach((path) => reserved.add(path));
    try {
        return await run();
    } finally {
        paths.forEach((path) => reserved.delete(path));
    }
}
