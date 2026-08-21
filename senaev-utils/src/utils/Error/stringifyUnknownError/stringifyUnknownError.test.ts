import {
    describe,
    expect,
    test,
} from 'vitest';

import { stringifyUnknownError } from './stringifyUnknownError';

describe('stringifyUnknownError', () => {
    test('returns the message of an Error', () => {
        expect(stringifyUnknownError(new Error('boom'))).toBe('boom');
    });

    test('returns the message of an Error subclass', () => {
        expect(stringifyUnknownError(new TypeError('bad type'))).toBe('bad type');
    });

    test('stringifies a thrown string', () => {
        expect(stringifyUnknownError('plain failure')).toBe('plain failure');
    });

    test('stringifies a thrown number rather than replacing it', () => {
        expect(stringifyUnknownError(42)).toBe('42');
    });

    test('stringifies null and undefined', () => {
        expect(stringifyUnknownError(null)).toBe('null');
        expect(stringifyUnknownError(undefined)).toBe('undefined');
    });
});
