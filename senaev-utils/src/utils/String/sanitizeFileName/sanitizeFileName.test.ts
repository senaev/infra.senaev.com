import {
    describe,
    expect,
    test,
} from 'vitest';

import { sanitizeFileName } from './sanitizeFileName';

describe('sanitizeFileName', () => {
    test('keeps letters, digits, dot, underscore and hyphen', () => {
        expect(sanitizeFileName('Ubuntu_24.04-LTS.torrent')).toBe('Ubuntu_24.04-LTS.torrent');
    });

    test('replaces spaces and punctuation', () => {
        expect(sanitizeFileName('my file (1).torrent')).toBe('my_file__1_.torrent');
    });

    test('replaces path separators, so the result stays a single segment', () => {
        expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    });

    test('replaces non-ascii characters', () => {
        expect(sanitizeFileName('Тест.torrent')).toBe('____.torrent');
    });

    test('leaves an empty string unchanged', () => {
        expect(sanitizeFileName('')).toBe('');
    });
});
