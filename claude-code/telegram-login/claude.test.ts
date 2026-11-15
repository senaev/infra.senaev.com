import {
    describe, expect, it,
} from 'vitest';

import { getAuthStatus, parseAuthStatus } from './claude.ts';

describe('parseAuthStatus', () => {
    it('reads the login state and the expiry date', () => {
        const status = parseAuthStatus('{"loggedIn": true, "authMethod": "claude.ai", "loginExpiresAt": "2026-12-15T01:13:42.953Z"}');

        expect(status.loggedIn).toBe(true);
        expect(status.loginExpiresAt?.toISOString()).toBe('2026-12-15T01:13:42.953Z');
    });

    it('has no expiry date when the field is missing or is not a date', () => {
        expect(parseAuthStatus('{"loggedIn": false}').loginExpiresAt).toBeNull();
        expect(parseAuthStatus('{"loggedIn": true, "loginExpiresAt": "soon"}').loginExpiresAt).toBeNull();
    });

    it('rejects output that is not a status', () => {
        expect(() => parseAuthStatus('Not logged in')).toThrow();
        expect(() => parseAuthStatus('[]')).toThrow('loggedIn');
        expect(() => parseAuthStatus('{"loggedIn": "yes"}')).toThrow('loggedIn');
    });
});

describe('getAuthStatus', () => {
    it('runs claude auth status and reads the answer even when the exit code is 1', async () => {
        const calls: string[][] = [];
        const status = await getAuthStatus((file, args) => {
            calls.push([
                file,
                ...args,
            ]);

            return Promise.resolve({
                stdout: '{"loggedIn": false}',
                exitCode: 1,
            });
        });

        expect(calls).toEqual([
            [
                'claude',
                'auth',
                'status',
            ],
        ]);
        expect(status.loggedIn).toBe(false);
    });
});
