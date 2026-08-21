import {
    describe,
    expect,
    test,
} from 'vitest';

import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
    test('escapes the four characters it covers', () => {
        expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
    });

    test('escapes an ampersand once, not twice', () => {
        expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('does not double-escape an already-escaped entity', () => {
        // The input `&lt;` is literal text, so only its `&` is escaped.
        expect(escapeHtml('&lt;')).toBe('&amp;lt;');
        expect(escapeHtml('<')).not.toContain('&amp;lt;');
    });

    test('leaves apostrophes alone', () => {
        expect(escapeHtml('it\'s')).toBe('it\'s');
    });

    test('neutralises a tag injected into text', () => {
        expect(escapeHtml('<script>alert(1)</script>'))
            .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('leaves text without special characters unchanged', () => {
        expect(escapeHtml('plain text 123')).toBe('plain text 123');
    });

    test('leaves an empty string unchanged', () => {
        expect(escapeHtml('')).toBe('');
    });
});
