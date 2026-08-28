import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    telegramBold,
    telegramCode,
    telegramExpandableBlockquote,
    telegramItalic,
    telegramLink,
} from './formatTelegramHtml';

describe('formatTelegramHtml', () => {
    describe('telegramBold', () => {
        it('should wrap text in a bold tag', () => {
            expect(telegramBold('hello')).toBe('<b>hello</b>');
        });

        it('should escape the text so markup in it cannot break parsing', () => {
            expect(telegramBold('a < b & c')).toBe('<b>a &lt; b &amp; c</b>');
        });

        it('should leave the MarkdownV2 reserved characters alone', () => {
            expect(telegramBold('v1.2-rc (final)!')).toBe('<b>v1.2-rc (final)!</b>');
        });
    });

    describe('telegramItalic', () => {
        it('should wrap text in an italic tag and escape it', () => {
            expect(telegramItalic('a & b')).toBe('<i>a &amp; b</i>');
        });
    });

    describe('telegramCode', () => {
        it('should wrap text in a code tag', () => {
            expect(telegramCode('npm run build')).toBe('<code>npm run build</code>');
        });

        // The MarkdownV2 equivalent needed a second escape function for this position.
        it('should escape a code entity the same way as ordinary text', () => {
            expect(telegramCode('if (a<b && c) {}')).toBe('<code>if (a&lt;b &amp;&amp; c) {}</code>');
        });

        it('should not escape a backtick or a backslash', () => {
            expect(telegramCode('`\\')).toBe('<code>`\\</code>');
        });
    });

    describe('telegramLink', () => {
        it('should build a link', () => {
            expect(telegramLink({
                text: 'open',
                url: 'https://example.com/',
            })).toBe('<a href="https://example.com/">open</a>');
        });

        it('should escape an ampersand in a query string so it cannot end the attribute', () => {
            expect(telegramLink({
                text: 'search',
                url: 'https://example.com/?a=1&b=2',
            })).toBe('<a href="https://example.com/?a=1&amp;b=2">search</a>');
        });

        it('should escape a quote in the url', () => {
            expect(telegramLink({
                text: 'x',
                url: 'https://example.com/"',
            })).toBe('<a href="https://example.com/&quot;">x</a>');
        });

        it('should escape the link text', () => {
            expect(telegramLink({
                text: '<b>not bold</b>',
                url: 'https://example.com/',
            })).toBe('<a href="https://example.com/">&lt;b&gt;not bold&lt;/b&gt;</a>');
        });
    });

    describe('telegramExpandableBlockquote', () => {
        it('should join the lines with newlines inside an expandable blockquote', () => {
            expect(telegramExpandableBlockquote([
                'first',
                'second',
            ])).toBe('<blockquote expandable>first\nsecond</blockquote>');
        });

        it('should escape every line', () => {
            expect(telegramExpandableBlockquote([
                'a < b',
                'c & d',
            ])).toBe('<blockquote expandable>a &lt; b\nc &amp; d</blockquote>');
        });

        it('should render a single line without a newline', () => {
            expect(telegramExpandableBlockquote(['only'])).toBe('<blockquote expandable>only</blockquote>');
        });
    });
});
