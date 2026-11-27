import {
    describe, expect, it,
} from 'vitest';

import { replaceWikiLinksWithHighlights } from './replaceWikiLinksWithHighlights';

describe('replaceWikiLinksWithHighlights', () => {
    it('highlights note names, aliases and subpaths without changing surrounding Markdown', () => {
        expect(replaceWikiLinksWithHighlights('**See** [[Note]] and [[path/Note#Heading| Display text ]] or [[Note#^block]].'))
            .toBe('**See** ==Note== and ==Display text== or ==Note#^block==.');
    });

    it('preserves inline, fenced and indented code containing wikilinks', () => {
        const code = [
            '`[[inline]]`',
            '```ts',
            'const note = "[[fenced]]";',
            '```',
            '',
            '~~~',
            '[[tilde]]',
            '~~~',
            '',
            '    [[indented]]',
        ].join('\n');

        expect(replaceWikiLinksWithHighlights(`${code}\n\n[[Outside]]`)).toBe(`${code}\n\n==Outside==`);
    });

    it('keeps embeds and external links unchanged', () => {
        expect(replaceWikiLinksWithHighlights('![[photo.png]] [site](https://example.com) [[Note|Alias]]'))
            .toBe('![[photo.png]] [site](https://example.com) ==Alias==');
    });

    it('escapes formatting in labels and preserves unicode and repeated links', () => {
        expect(replaceWikiLinksWithHighlights('[[Note|a*b==c]] [[Фёдор]] [[Фёдор]]'))
            .toBe('==a\\*b\\=\\=c== ==Фёдор== ==Фёдор==');
    });

    it('does not nest a highlight inside a highlight that the note already has', () => {
        expect(replaceWikiLinksWithHighlights('==[[@fedya]]==\n- ==Go with [[Note|Pasha]] and [[Anna]]== then [[Later]]'))
            .toBe('==@fedya==\n- ==Go with Pasha and Anna== then ==Later==');
    });

    it('ignores escaped highlight markers when checking for an open highlight', () => {
        expect(replaceWikiLinksWithHighlights('a \\== b [[Note]]'))
            .toBe('a \\== b ==Note==');
    });
});
