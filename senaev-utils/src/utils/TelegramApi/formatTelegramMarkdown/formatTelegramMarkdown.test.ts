import {
    describe, expect, it,
} from 'vitest';

import {
    escapeTelegramMarkdown, telegramBold, telegramCode, telegramCodeBlock,
    telegramExpandableBlockquote, telegramItalic, telegramLink,
} from './formatTelegramMarkdown';

describe('formatTelegramMarkdown', () => {
    it('escapes user text, including GFM block and inline delimiters', () => {
        expect(escapeTelegramMarkdown('A *[test](x) | # <b> $10 \\')).toBe('A \\*\\[test\\]\\(x\\) \\| \\# \\<b\\> \\$10 \\\\');
        expect(telegramBold('a * b')).toBe('**a \\* b**');
        expect(telegramItalic('a_b')).toBe('*a\\_b*');
    });

    it('preserves backticks and punctuation within code spans and fences', () => {
        expect(telegramCode('npm run build')).toBe('`npm run build`');
        expect(telegramCode('a`b')).toBe('`` a`b ``');
        expect(telegramCode('a\nb')).toBe('```\na\nb\n```');
        expect(telegramCodeBlock('a```b')).toBe('````\na```b\n````');
    });

    it('escapes link labels and parentheses in URL, and rejects unsafe schemes', () => {
        expect(telegramLink({
            text: '[open]',
            url: 'https://example.com/a(b)?x=1&y=2',
        }))
            .toBe('[\\[open\\]](https://example.com/a%28b%29?x=1&y=2)');
        expect(telegramLink({
            text: 'open',
            url: 'javascript:alert(1)',
        })).toBe('open');
    });

    it('renders collapsible details in rich Markdown without parsing untrusted input', () => {
        expect(telegramExpandableBlockquote([
            'first * line',
            '<img>',
        ])).toBe('<details><summary>Details</summary>\n\nfirst \\* line  \n\\<img\\>\n</details>');
    });
});
