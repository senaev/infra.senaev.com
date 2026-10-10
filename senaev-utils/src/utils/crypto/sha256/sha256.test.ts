import {
    describe,
    expect,
    test,
} from 'vitest';

import { sha256, sha256Hex } from './sha256';

describe('sha256', () => {
    test('gives the known digest of a string, as bytes and as hex', () => {
        const digest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

        expect(sha256Hex('abc')).toBe(digest);
        expect(sha256('abc').toString('hex')).toBe(digest);
    });
});
