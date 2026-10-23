import {
    describe, expect, it,
} from 'vitest';

import {
    appendShortLinkRow, formatShortLinksCsv, isAllowedShortLinkTarget, parseShortLinksCsv,
} from './shortLinksCsv';

describe('isAllowedShortLinkTarget', () => {
    it.each([
        'https://senaev.com/cv/5min',
        'http://example.com',
    ])('allows %s', (url) => {
        expect(isAllowedShortLinkTarget(url)).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'ftp://example.com',
        'senaev.com',
        '',
    ])('refuses %s', (url) => {
        expect(isAllowedShortLinkTarget(url)).toBe(false);
    });
});

describe('parseShortLinksCsv', () => {
    it('reads the id and url columns by name, keeps other columns, and skips bad rows', () => {
        const table = parseShortLinksCsv([
            '\uFEFFcomment,url,id',
            'CV,https://senaev.com/cv/5min,1bxsl9',
            '"a, b",javascript:alert(1),bad001',
            ',https://example.com,',
            '',
            'quoted,"https://example.com/?a=1,2",q1',
            '',
        ].join('\r\n'));

        expect(table.headers).toEqual([
            'comment',
            'url',
            'id',
        ]);
        expect(table.links).toEqual(new Map([
            [
                '1bxsl9',
                'https://senaev.com/cv/5min',
            ],
            [
                'q1',
                'https://example.com/?a=1,2',
            ],
        ]));
    });

    it('reads an empty file as an empty table', () => {
        expect(parseShortLinksCsv('').links.size).toBe(0);
    });

    it('refuses a table without the id and url columns', () => {
        expect(() => parseShortLinksCsv('name,link\na,https://example.com\n')).toThrow('"id" and "url" columns');
    });
});

describe('appendShortLinkRow', () => {
    it('writes the header row into an empty file', () => {
        expect(appendShortLinkRow('', [
            'id',
            'url',
        ], 'abc123', 'https://example.com')).toBe('id,url\nabc123,https://example.com\n');
    });

    it('puts the values in the columns of the file, keeps its line ending, and adds a missing one', () => {
        const content = 'url,note, Id\r\nhttps://a.com,x,a1';
        const { headers } = parseShortLinksCsv(content);

        expect(appendShortLinkRow(content, headers, 'b2', 'https://b.com/?q=1,2')).toBe('url,note, Id\r\nhttps://a.com,x,a1\r\n"https://b.com/?q=1,2",,b2\r\n');
    });
});

describe('formatShortLinksCsv', () => {
    it('makes a table that parses back to the same links', () => {
        const links = new Map([
            [
                'a1',
                'https://example.com/?a=1,2',
            ],
            [
                'b2',
                'https://example.com/"quoted"',
            ],
        ]);

        expect(parseShortLinksCsv(formatShortLinksCsv(links)).links).toEqual(links);
    });
});
