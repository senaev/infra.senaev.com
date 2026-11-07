import {
    describe, expect, it,
} from 'vitest';

import { splitTelegramMarkdown, TELEGRAM_RICH_MESSAGE_MAX_LENGTH } from './splitTelegramMarkdown';

const withinLimit = (parts: string[]): boolean => parts.every((part) => Buffer.byteLength(part) <= TELEGRAM_RICH_MESSAGE_MAX_LENGTH);

describe('splitTelegramMarkdown', () => {
    it('preserves small Markdown unchanged', () => {
        expect(splitTelegramMarkdown('**Hello**\n\n[link](https://example.com)')).toEqual(['**Hello**\n\n[link](https://example.com)']);
    });

    it('splits long Unicode text without losing content or splitting escaped markers', () => {
        const markdown = ('🎬a\\*'.repeat(8000));
        const chunks = splitTelegramMarkdown(markdown);

        expect(chunks.length).toBeGreaterThan(1);
        expect(withinLimit(chunks)).toBe(true);
        expect(chunks.join('')).toBe(markdown);
        expect(chunks.every((chunk) => !chunk.endsWith('\\'))).toBe(true);
    });

    it('reopens fenced code blocks when a cut falls inside one', () => {
        const markdown = `\`\`\`\n${'x'.repeat(70_000)}\n\`\`\``;
        const chunks = splitTelegramMarkdown(markdown);

        expect(withinLimit(chunks)).toBe(true);
        expect(chunks.length).toBeGreaterThan(2);
        expect(chunks.every((chunk) => chunk.startsWith('```') && chunk.trimEnd().endsWith('```'))).toBe(true);
        expect(chunks.join('').split('x').length - 1).toBe(70_000);
    });

    it('keeps large collapsible details valid in every part', () => {
        const markdown = `<details><summary>Details</summary>\n\n${'foo\n'.repeat(9000)}</details>`;
        const chunks = splitTelegramMarkdown(markdown);

        expect(withinLimit(chunks)).toBe(true);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every((chunk) => chunk.includes('<details>') && chunk.includes('</details>'))).toBe(true);
    });

    it('rejects empty messages explicitly', () => {
        expect(() => splitTelegramMarkdown('')).toThrow('empty');
    });
});
