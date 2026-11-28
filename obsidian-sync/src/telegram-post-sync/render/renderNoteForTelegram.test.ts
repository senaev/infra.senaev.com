import {
    describe, expect, it,
} from 'vitest';

import { renderNoteForTelegram } from './renderNoteForTelegram';

describe('renderNoteForTelegram', () => {
    it('preserves lines within verses and paragraph spacing between verses', () => {
        const note = [
            '---',
            'telegram-post-clone: https://t.me/c/123/4',
            '---',
            '# Song',
            '',
            'C Am F G',
            '',
            'First line',
            'Second line\t',
            '**Third line**',
            '',
            'Second verse',
            'Last line',
        ].join('\n');

        expect(renderNoteForTelegram(note).markdown).toBe([
            '# 🪨 Song',
            '',
            'C Am F G',
            '',
            'First line  ',
            'Second line  ',
            '**Third line**',
            '',
            'Second verse  ',
            'Last line',
        ].join('\n'));
    });

    it('keeps existing hard breaks and block structure around paragraph breaks', () => {
        const note = [
            '# Song',
            '',
            'Existing  ',
            'Backslash\\',
            'Plain',
            'Last',
            '',
            '- First item',
            '  continued',
            '- Second item',
            '',
            '| Chord | Fingering |',
            '| --- | --- |',
            '| C | x32010 |',
            '',
            '~~~text',
            'C       Am',
            'Line below',
            '~~~',
            '',
            'Inline `code on',
            'two lines`',
            'Next line',
        ].join('\n');

        expect(renderNoteForTelegram(note).markdown).toBe([
            '# 🪨 Song',
            '',
            'Existing  ',
            'Backslash\\',
            'Plain  ',
            'Last',
            '',
            '- First item  ',
            '  continued',
            '- Second item',
            '',
            '| Chord | Fingering |',
            '| --- | --- |',
            '| C | x32010 |',
            '',
            '~~~text',
            'C       Am',
            'Line below',
            '~~~',
            '',
            'Inline `code on',
            'two lines`  ',
            'Next line',
        ].join('\n'));
    });
});
