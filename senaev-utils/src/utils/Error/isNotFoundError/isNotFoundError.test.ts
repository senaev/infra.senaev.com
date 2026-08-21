import {
    describe,
    expect,
    test,
} from 'vitest';

import { isNotFoundError } from './isNotFoundError';

function errorWithCode(code: string): Error {
    return Object.assign(new Error(code), { code });
}

describe('isNotFoundError', () => {
    test('accepts an Error carrying ENOENT', () => {
        expect(isNotFoundError(errorWithCode('ENOENT'))).toBe(true);
    });

    test('rejects another filesystem error code', () => {
        expect(isNotFoundError(errorWithCode('EACCES'))).toBe(false);
    });

    test('rejects an Error with no code', () => {
        expect(isNotFoundError(new Error('boom'))).toBe(false);
    });

    test('rejects a non-Error that merely carries the code', () => {
        expect(isNotFoundError({ code: 'ENOENT' })).toBe(false);
    });

    test('rejects null and undefined', () => {
        expect(isNotFoundError(null)).toBe(false);
        expect(isNotFoundError(undefined)).toBe(false);
    });
});
