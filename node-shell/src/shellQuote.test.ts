import {
    describe, expect, it,
} from 'vitest';

import { shellQuote } from './shellQuote';

describe('shellQuote', () => {
    it('wraps a value in single quotes', () => {
        expect(shellQuote('echo $HOME; rm -rf /')).toBe('\'echo $HOME; rm -rf /\'');
    });

    it('closes the quotes around a single quote and escapes it', () => {
        expect(shellQuote('it\'s')).toBe('\'it\'\\\'\'s\'');
    });

    it('quotes an empty value as an empty argument', () => {
        expect(shellQuote('')).toBe('\'\'');
    });
});
