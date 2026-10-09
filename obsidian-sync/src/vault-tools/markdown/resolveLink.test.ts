import {
    describe, expect, it,
} from 'vitest';

import { extractLinks } from './extractLinks';
import { createLinkIndex, resolveLink } from './resolveLink';

const FILES = [
    'Apache.md',
    'notes/Ideas.md',
    'archive/Ideas.md',
    'places/cities/Madrid.md',
    'work/DataDog/Flex.md',
    'work/Yandex/Flex.md',
    '_Resources/photo.png',
    'periodic/day/2026-10-07.md',
];

const ALIASES = new Map([
    [
        '_people/@luli.md',
        [
            'Luli',
            'Юля',
        ],
    ],
]);

const index = createLinkIndex([
    ...FILES,
    '_people/@luli.md',
], ALIASES);

function resolve(markdown: string, sourcePath = 'periodic/day/2026-10-07.md') {
    const [link] = extractLinks(markdown);

    if (link === undefined) {
        throw new Error(`No link in ${markdown}`);
    }

    return resolveLink(index, sourcePath, link);
}

describe('resolveLink', () => {
    it('resolves a unique note name anywhere in the vault, case-insensitively', () => {
        expect(resolve('[[madrid]]')).toEqual({
            status: 'resolved',
            path: 'places/cities/Madrid.md',
        });
    });

    it('reports a name that several notes share instead of picking one', () => {
        expect(resolve('[[Ideas]]')).toEqual({
            status: 'ambiguous',
            candidates: [
                'archive/Ideas.md',
                'notes/Ideas.md',
            ],
        });
    });

    it('resolves a path from the vault root exactly', () => {
        expect(resolve('[[notes/Ideas]]')).toEqual({
            status: 'resolved',
            path: 'notes/Ideas.md',
        });
    });

    it('resolves a partial path by its ending, and reports it when that is ambiguous', () => {
        expect(resolve('[[DataDog/Flex]]')).toEqual({
            status: 'resolved',
            path: 'work/DataDog/Flex.md',
        });
        expect(resolve('[[Flex]]')).toMatchObject({ status: 'ambiguous' });
    });

    it('resolves attachments by their full file name', () => {
        expect(resolve('![[photo.png]]')).toEqual({
            status: 'resolved',
            path: '_Resources/photo.png',
        });
    });

    it('resolves Markdown links relative to the note first', () => {
        expect(resolve('[a](../../Apache.md)')).toEqual({
            status: 'resolved',
            path: 'Apache.md',
        });
        expect(resolve('[a](Madrid.md)', 'places/cities/Other.md')).toEqual({
            status: 'resolved',
            path: 'places/cities/Madrid.md',
        });
    });

    it('never resolves a relative path that climbs out of the vault', () => {
        expect(resolve('[a](../../../Apache.md)')).toEqual({ status: 'unresolved' });
    });

    it('resolves a link with only a heading or block to the note itself', () => {
        expect(resolve('[[#^abc]]', 'Apache.md')).toEqual({
            status: 'resolved',
            path: 'Apache.md',
        });
    });

    it('reports a frontmatter alias match separately, because Obsidian does not resolve it', () => {
        expect(resolve('[[Юля]]')).toEqual({
            status: 'alias',
            candidates: ['_people/@luli.md'],
        });
    });

    it('reports a missing target as unresolved', () => {
        expect(resolve('[[Nowhere]]')).toEqual({ status: 'unresolved' });
    });

    it('does not try to resolve external links', () => {
        expect(resolve('[x](mailto:a@b.c)')).toEqual({
            status: 'external',
            url: 'mailto:a@b.c',
        });
    });
});
