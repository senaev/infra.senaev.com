import {
    describe,
    expect,
    test,
} from 'vitest';

import { createBearerAuthorizationHeader, isValidBearerAuthorizationHeader } from './bearerToken';

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
