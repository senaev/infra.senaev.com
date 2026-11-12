import {
    describe, expect, test,
} from 'vitest';

import { stripFrontmatter } from './stripFrontmatter';

describe('stripFrontmatter', () => {
    test('splits the frontmatter from the body', () => {
        expect(stripFrontmatter('---\na: 1\nb: 2\n---\nText\n')).toEqual({
            frontmatter: 'a: 1\nb: 2',
            body: 'Text\n',
        });
    });

    test('accepts an empty block and a block at the end of the file', () => {
        expect(stripFrontmatter('---\n---\nText')).toEqual({
            frontmatter: '',
            body: 'Text',
        });
        expect(stripFrontmatter('---\na: 1\n---')).toEqual({
            frontmatter: 'a: 1',
            body: '',
        });
    });

    test('returns the whole content as the body when there is no block', () => {
        for (const content of [
            'Text\n---\n',
            '---\na: 1\n',
            '---\r\na: 1\r\n---\r\nText',
        ]) {
            expect(stripFrontmatter(content)).toEqual({
                frontmatter: '',
                body: content,
            });
        }
    });
});
