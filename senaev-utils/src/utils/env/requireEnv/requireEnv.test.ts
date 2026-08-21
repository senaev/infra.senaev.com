import {
    afterEach,
    describe,
    expect,
    test,
} from 'vitest';

import { requireEnv } from './requireEnv';

const VARIABLE_NAME = 'SENAEV_UTILS_REQUIRE_ENV_TEST';

describe('requireEnv', () => {
    afterEach(() => {
        delete process.env[VARIABLE_NAME];
    });

    test('returns the value when the variable is set', () => {
        process.env[VARIABLE_NAME] = 'value';

        expect(requireEnv(VARIABLE_NAME)).toBe('value');
    });

    test('throws naming the variable when it is unset', () => {
        expect(() => requireEnv(VARIABLE_NAME))
            .toThrow(`Missing required environment variable: ${VARIABLE_NAME}`);
    });

    test('treats an empty string as missing', () => {
        process.env[VARIABLE_NAME] = '';

        expect(() => requireEnv(VARIABLE_NAME)).toThrow();
    });

    test('keeps a value that is falsy as a string but present', () => {
        process.env[VARIABLE_NAME] = '0';

        expect(requireEnv(VARIABLE_NAME)).toBe('0');
    });
});
