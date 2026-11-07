import {
    describe, expect, it,
} from 'vitest';

import { splitTelegramHtml, TELEGRAM_RICH_MESSAGE_MAX_LENGTH } from './splitTelegramHtml';

function visibleText(html: string): string {
    return html.replaceAll(/<\/?(?:b|blockquote(?: expandable)?)>/gu, '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"');
}

describe('splitTelegramHtml', () => {
    it('keeps a short formatted message unchanged', () => {
        expect(splitTelegramHtml('<b>Hello</b>')).toEqual(['<b>Hello</b>']);
    });

    it('splits long messages without dropping text or breaking HTML entities or surrogate pairs', () => {
        const html = `<b>${'🎬&amp;&lt;'.repeat(3500)}</b>\n<blockquote expandable>${'x'.repeat(5000)}</blockquote>`;
        const chunks = splitTelegramHtml(html);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => Buffer.byteLength(chunk) <= TELEGRAM_RICH_MESSAGE_MAX_LENGTH)).toBe(true);
        expect(chunks.map(visibleText).join('')).toBe(visibleText(html));
        expect(chunks.every((chunk) => (chunk.match(/<b>/gu) ?? []).length === (chunk.match(/<\/b>/gu) ?? []).length && (chunk.match(/<blockquote expandable>/gu) ?? []).length === (chunk.match(/<\/blockquote>/gu) ?? []).length)).toBe(true);
    });
});
