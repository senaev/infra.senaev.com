import {
    describe, expect, it,
} from 'vitest';

import { createCommandExecution } from '../commands/CommandExecution';

import { createFileDiff } from './createFileDiff';
import { createFileDiffAsync } from './createFileDiffAsync';

describe('createFileDiffAsync', { timeout: 15000 }, () => {
    it.each([
        {
            before: 'a\nb\n',
            after: 'a\nc\n',
        },
        {
            before: '',
            after: (`${'x'.repeat(100)}\n`).repeat(300),
        },
        {
            before: 'unchanged',
            after: 'unchanged',
        },
    ])('uses the same headers, context and truncation as the synchronous core', async ({ before, after }) => {
        expect(await createFileDiffAsync('Note.md', before, after, createCommandExecution())).toEqual(createFileDiff('Note.md', before, after));
    });

    it('rejects an already aborted context before creating a worker', async () => {
        const controller = new AbortController();
        const reason = new Error('cancelled');

        controller.abort(reason);
        await expect(createFileDiffAsync('Note.md', 'before', 'after', createCommandExecution({ signal: controller.signal }))).rejects.toBe(reason);
    });
});
