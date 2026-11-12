import {
    describe, expect, it,
} from 'vitest';

import { normalizeAbsolutePath } from './fileAccess';

describe('normalizeAbsolutePath', () => {
    it('normalizes an absolute path and removes a trailing "/"', () => {
        expect(normalizeAbsolutePath('/', 'path')).toBe('/');
        expect(normalizeAbsolutePath('//a//b/', 'path')).toBe('/a/b');
        expect(normalizeAbsolutePath('/a/../..', 'path')).toBe('/');
        expect(normalizeAbsolutePath('/a/./b', 'path')).toBe('/a/b');
    });

    it('rejects a relative path, an empty path and a NUL character', () => {
        for (const input of [
            'a/b',
            '',
            '/a\0/b',
        ]) {
            expect(() => normalizeAbsolutePath(input, 'path')).toThrow(expect.objectContaining({
                code: 'invalid_arguments',
                message: expect.stringContaining('"path"'),
            }));
        }
    });
});
