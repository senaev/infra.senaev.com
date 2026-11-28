import { execFileSync } from 'node:child_process';

import {
    describe, expect, it,
} from 'vitest';

import { shellQuote } from './shellQuote';

// What the remote login shell does with the string that ssh sends: parse it again.
function parseWithShell(quoted: string): string {
    return execFileSync('/bin/sh', [
        '-c',
        `printf %s ${quoted}`,
    ], { encoding: 'utf8' });
}

describe('shellQuote with a real shell', () => {
    it.each([
        'plain',
        'it\'s',
        '\'\'\'',
        'a "double" and `backtick` $(id) $HOME \\ \\\'',
        'two\nlines\ttab',
        '; rm -rf / #',
        '',
    ])('reaches the shell unchanged: %j', (value) => {
        expect(parseWithShell(shellQuote(value))).toBe(value);
    });
});
