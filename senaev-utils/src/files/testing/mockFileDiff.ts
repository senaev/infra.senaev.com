import { vi } from 'vitest';

import type { CommandExecution } from '../../commands/CommandExecution';
import { createFileDiff } from '../createFileDiff';

// Domain tests exercise edits/publication with real diff output. Native worker
// lifecycle and abort coverage live in the isolated senaev-utils integration suite.
vi.mock(import('../createFileDiffAsync'), () => {
    return {
        createFileDiffAsync: vi.fn(async (path: string, before: string, after: string, execution: CommandExecution) => {
            execution.throwIfAborted();
            await execution.checkpoint();

            return createFileDiff(path, before, after);
        }),
    };
});
