import {
    describe, expect, it,
} from 'vitest';

import { createCommandExecution } from '../commands/CommandExecution';

import { replaceExactlyOnce, replaceExactlyOnceAsync } from './textEdits';
import { createLineOffsets, createLineOffsetsAsync } from './textLines';

describe('shared text operations', () => {
    it.each([
        '',
        'one',
        'one\n',
        '\none\nlast',
        'a\n\n',
    ])('keeps synchronous and cooperative line boundaries equal for %j', async (content) => {
        expect(await createLineOffsetsAsync(content, () => Promise.resolve())).toEqual(createLineOffsets(content));
    });

    it('uses the same exact replacement semantics in sync and async consumers', async () => {
        const content = 'До\nunique\nПосле';

        expect(await replaceExactlyOnceAsync(content, 'unique', 'новое', {
            documentName: 'note',
            execution: createCommandExecution(),
        })).toBe(replaceExactlyOnce(content, 'unique', 'новое', 'note'));
    });

    it.each([
        [
            'missing',
            'not_found',
            undefined,
        ],
        [
            'x',
            'ambiguous',
            {
                lines: [
                    1,
                    2,
                    3,
                ],
            },
        ],
    ])('preserves shared %s diagnostics', async (find, code, details) => {
        const content = 'x\nx\nx';
        let synchronous: unknown;

        try {
            replaceExactlyOnce(content, find, 'new', 'note');
        } catch (error) {
            synchronous = error;
        }

        expect(synchronous).toMatchObject({
            code,
            ...(details ? { details } : {}),
        });
        await expect(replaceExactlyOnceAsync(content, find, 'new', {
            documentName: 'note',
            execution: createCommandExecution(),
        })).rejects.toMatchObject(synchronous as Error);
    });
});
