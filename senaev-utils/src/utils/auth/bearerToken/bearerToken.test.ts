import {
    describe,
    expect,
    test,
} from 'vitest';

import {
    createBearerAuthorizationHeader, isValidBearerAuthorizationHeader, parseBearerToken,
} from './bearerToken';

describe('parseBearerToken', () => {
    test('returns the token of a Bearer header, with any case of the scheme', () => {
        expect(parseBearerToken('Bearer abc.def')).toBe('abc.def');
        expect(parseBearerToken('bearer abc')).toBe('abc');
    });

    test('returns undefined for another scheme, an empty or spaced token, or a non-string', () => {
        expect(parseBearerToken('Basic abc')).toBeUndefined();
        expect(parseBearerToken('Bearer ')).toBeUndefined();
        expect(parseBearerToken('Bearer a b')).toBeUndefined();
        expect(parseBearerToken(undefined)).toBeUndefined();
        expect(parseBearerToken(['Bearer abc'])).toBeUndefined();
    });
});

describe('isValidBearerAuthorizationHeader', () => {
    test('accepts the header made for the same token', () => {
        expect(isValidBearerAuthorizationHeader(createBearerAuthorizationHeader('secret'), 'secret')).toBe(true);
    });

    test('rejects another token, including a prefix of the right one', () => {
        expect(isValidBearerAuthorizationHeader('Bearer other', 'secret')).toBe(false);
        expect(isValidBearerAuthorizationHeader('Bearer secre', 'secret')).toBe(false);
    });

    test('rejects a missing header, another scheme and a non-string value', () => {
        expect(isValidBearerAuthorizationHeader(undefined, 'secret')).toBe(false);
        expect(isValidBearerAuthorizationHeader('Basic secret', 'secret')).toBe(false);
        expect(isValidBearerAuthorizationHeader(['Bearer secret'], 'secret')).toBe(false);
    });

    test('never accepts anything when the expected token is empty', () => {
        expect(isValidBearerAuthorizationHeader('Bearer ', '')).toBe(false);
    });
});
