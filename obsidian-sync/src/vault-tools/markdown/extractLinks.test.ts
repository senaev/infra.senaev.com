import {
    describe, expect, it,
} from 'vitest';

import { type ExtractedLink, extractLinks } from './extractLinks';

function only(content: string): ExtractedLink {
    const links = extractLinks(content);

    expect(links).toHaveLength(1);

    return links[0] as ExtractedLink;
}

describe('extractLinks', () => {
    it('reads a plain wikilink', () => {
        expect(only('See [[My Note]] here')).toEqual({
            kind: 'wikilink',
            embed: false,
            raw: '[[My Note]]',
            offset: 4,
            line: 1,
            target: 'My Note',
            subpath: null,
            displayText: null,
            externalUrl: null,
        });
    });

    it('splits the display alias off a wikilink', () => {
        expect(only('[[@luli|Luli]]')).toMatchObject({
            target: '@luli',
            displayText: 'Luli',
        });
    });

    it('reads an escaped pipe in a table as the alias separator', () => {
        expect(only('| [[Note\\|Alias]] |')).toMatchObject({
            target: 'Note',
            displayText: 'Alias',
        });
    });

    it('reads heading references, including nested headings', () => {
        expect(only('[[Note#Plans]]')).toMatchObject({
            target: 'Note',
            subpath: {
                type: 'heading',
                value: 'Plans',
            },
        });
        expect(only('[[Note#Week 3#Notes]]').subpath).toEqual({
            type: 'heading',
            value: 'Week 3 > Notes',
        });
    });

    it('reads block references', () => {
        expect(only('[[Note#^abc123|quote]]')).toMatchObject({
            target: 'Note',
            subpath: {
                type: 'block',
                value: 'abc123',
            },
            displayText: 'quote',
        });
    });

    it('reads a link to a heading in the same note with an empty target', () => {
        expect(only('[[#Plans]]')).toMatchObject({
            target: '',
            subpath: {
                type: 'heading',
                value: 'Plans',
            },
        });
    });

    it('marks embeds, for wikilinks and Markdown images', () => {
        expect(only('![[daily_note_draft]]')).toMatchObject({
            kind: 'wikilink',
            embed: true,
            target: 'daily_note_draft',
        });
        expect(only('![photo](_Resources/photo%201.png)')).toMatchObject({
            kind: 'markdown',
            embed: true,
            target: '_Resources/photo 1.png',
        });
    });

    it('decodes Markdown link paths and splits the heading off', () => {
        expect(only('[plans](../Some%20Note.md#Next%20year)')).toMatchObject({
            kind: 'markdown',
            embed: false,
            target: '../Some Note.md',
            subpath: {
                type: 'heading',
                value: 'Next year',
            },
            externalUrl: null,
        });
    });

    it('marks external links and keeps their URL untouched', () => {
        expect(only('[site](https://senaev.com/a#b)')).toMatchObject({
            kind: 'markdown',
            target: 'https://senaev.com/a#b',
            subpath: null,
            externalUrl: 'https://senaev.com/a#b',
        });
    });

    it('reads reference-style link definitions', () => {
        expect(extractLinks('[text][ref]\n\n[ref]: other.md').map((link) => link.target)).toEqual(['other.md']);
    });

    it('ignores links in code blocks and inline code', () => {
        const content = [
            '`[[Inline]]`',
            '',
            '```',
            '[[Fenced]]',
            '[x](fenced.md)',
            '```',
            '',
            '[[Real]]',
        ].join('\n');

        expect(extractLinks(content).map((link) => link.target)).toEqual(['Real']);
    });

    it('counts links in frontmatter properties, as Obsidian does', () => {
        const content = '---\nauthor: "[[@senaev]]"\n---\n# Title\n';

        expect(only(content)).toMatchObject({
            target: '@senaev',
            line: 2,
        });
    });

    it('reports line numbers and keeps the order of the note', () => {
        const content = '# A\n\n[b](b.md) and [[c]]\n\n[[d]]\n';

        expect(extractLinks(content).map((link) => [
            link.target,
            link.line,
        ])).toEqual([
            [
                'b.md',
                3,
            ],
            [
                'c',
                3,
            ],
            [
                'd',
                5,
            ],
        ]);
    });
});
