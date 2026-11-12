import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCommandExecution, type CommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { assertExistingFile, assertExistingFolder } from './fileAccess';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'file-access-cancel-regression-'));
});
afterEach(async () => {
    await rm(root, {
        recursive: true,
        force: true,
    });
});

/** Aborts with `reason` while the path check after the first checkpoint runs. */
function abortDuringPathCheck(controller: AbortController, reason: unknown): CommandExecution {
    const base = createCommandExecution({ signal: controller.signal });

    return {
        ...base,
        checkpoint: async () => {
            await base.checkpoint();
            queueMicrotask(() => controller.abort(reason));
        },
    };
}

describe.each([
    [
        'assertExistingFolder',
        assertExistingFolder,
    ],
    [
        'assertExistingFile',
        assertExistingFile,
    ],
])('%s', (_name, assertExisting) => {
    it('keeps an ENOENT-shaped abort reason as the abort reason', async () => {
        const controller = new AbortController();
        const reason = Object.assign(new Error('cancelled during path checking'), { code: 'ENOENT' });

        await expect(assertExisting(join(root, 'missing'), abortDuringPathCheck(controller, reason))).rejects.toBe(reason);
        expect(controller.signal.aborted).toBe(true);
    });

    it('reports a missing path as not_found', async () => {
        await expect(assertExisting(join(root, 'missing'), createCommandExecution())).rejects.toMatchObject({ code: 'not_found' });
    });
});
