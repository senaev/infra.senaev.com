import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCommandExecution } from 'senaev-utils/src/commands/CommandExecution';
import {
    afterEach, beforeEach, describe, expect, it,
} from 'vitest';

import { createCodeToolsConfig } from './codeToolsConfig';
import { resolveNamedProject } from './projectAccess';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'project-cancel-regression-'));
});
afterEach(async () => {
    await rm(root, {
        recursive: true,
        force: true,
    });
});

describe('typed project resolution cancellation', () => {
    it('preserves the exact ENOENT-shaped cancellation reason during path checking', async () => {
        const controller = new AbortController();
        const reason = Object.assign(new Error('cancelled during path resolution'), { code: 'ENOENT' });
        const base = createCommandExecution({ signal: controller.signal });
        let checkpoints = 0;
        const execution = {
            ...base,
            checkpoint: async () => {
                await base.checkpoint();
                checkpoints += 1;
                if (checkpoints === 2) {
                    queueMicrotask(() => controller.abort(reason));
                }
            },
        };

        await expect(resolveNamedProject(createCodeToolsConfig(root), 'missing', execution)).rejects.toBe(reason);
        expect(controller.signal.aborted).toBe(true);
    });

    it('keeps ordinary missing projects as not_found', async () => {
        await expect(resolveNamedProject(createCodeToolsConfig(root), 'missing', createCommandExecution())).rejects.toMatchObject({ code: 'not_found' });
    });
});
