import {
    describe, expect, it,
} from 'vitest';

import { withFileMutation, withFileMutations } from './withFileMutation';

describe('mutation write sets', () => {
    it('rejects overlaps atomically, permits independent files, and releases every reservation after failure', async () => {
        let release = () => {};
        let started = () => {};
        const ready = new Promise<void>((resolve) => {
            started = resolve;
        });
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const running = withFileMutations([
            'a',
            'b',
            'a',
        ], async () => {
            started();
            await gate;
            throw new Error('write failed');
        });

        await ready;
        await expect(withFileMutations([
            'c',
            'b',
        ], () => Promise.resolve('overlap'))).rejects.toMatchObject({ code: 'conflict' });
        expect(await withFileMutation('c', () => Promise.resolve('independent'))).toBe('independent');
        const failure = expect(running).rejects.toThrow('write failed');

        release();
        await failure;
        expect(await withFileMutations([
            'a',
            'b',
        ], () => Promise.resolve('released'))).toBe('released');
    });
});
