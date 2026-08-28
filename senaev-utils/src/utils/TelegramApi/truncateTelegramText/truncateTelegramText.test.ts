import {
    describe,
    expect,
    it,
} from 'vitest';

import {
    TELEGRAM_CAPTION_MAX_LENGTH,
    TELEGRAM_MESSAGE_MAX_LENGTH,
    truncateTelegramCaption,
    truncateTelegramText,
} from './truncateTelegramText';

/** A character outside the BMP, so one emoji is two UTF-16 code units. */
const EMOJI = '🎬';

/** True when the string ends on an unpaired high surrogate, which is not valid text. */
function endsOnLoneSurrogate(text: string): boolean {
    const lastUnit = text.charCodeAt(text.length - 1);

    return lastUnit >= 0xd800 && lastUnit <= 0xdbff;
}

describe('truncateTelegramText', () => {
    it('should return short text unchanged', () => {
        expect(truncateTelegramText('hello')).toBe('hello');
    });

    it('should return empty text unchanged', () => {
        expect(truncateTelegramText('')).toBe('');
    });

    it('should return text of exactly the maximum length unchanged', () => {
        const text = 'a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH);

        expect(truncateTelegramText(text)).toBe(text);
    });

    it('should cut text one character over the maximum length', () => {
        const result = truncateTelegramText('a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH + 1));

        expect(result).toHaveLength(TELEGRAM_MESSAGE_MAX_LENGTH);
        expect(result.endsWith('…')).toBe(true);
    });

    it('should keep the result within the limit including the ellipsis', () => {
        const result = truncateTelegramText('a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH * 3));

        expect(result).toHaveLength(TELEGRAM_MESSAGE_MAX_LENGTH);
        expect(result.endsWith('…')).toBe(true);
    });

    it('should keep the head of the text', () => {
        const result = truncateTelegramText(`head${'a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH)}`);

        expect(result.startsWith('head')).toBe(true);
    });

    it('should use exactly one character for the ellipsis', () => {
        const result = truncateTelegramText('a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH + 1));

        expect(result.slice(0, -1)).toBe('a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH - 1));
    });

    describe('when the cut falls inside a surrogate pair', () => {
        // The emoji straddles the boundary: its high half is the last unit that fits, and its
        // low half is the first unit dropped.
        const textCutMidEmoji = `${'a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH - 2)}${EMOJI}${EMOJI}`;

        it('should not leave a lone surrogate behind', () => {
            const result = truncateTelegramText(textCutMidEmoji);

            expect(endsOnLoneSurrogate(result.slice(0, -1))).toBe(false);
        });

        it('should drop the split emoji rather than half of it', () => {
            const result = truncateTelegramText(textCutMidEmoji);

            expect(result).toBe(`${'a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH - 2)}…`);
        });

        it('should keep a surrogate pair that fits whole', () => {
            const text = `${EMOJI.repeat(TELEGRAM_MESSAGE_MAX_LENGTH)}`;
            const result = truncateTelegramText(text);

            expect(endsOnLoneSurrogate(result.slice(0, -1))).toBe(false);
            expect(result).toBe(`${EMOJI.repeat(TELEGRAM_MESSAGE_MAX_LENGTH / 2 - 1)}…`);
        });
    });
});

describe('truncateTelegramCaption', () => {
    it('should return short text unchanged', () => {
        expect(truncateTelegramCaption('hello')).toBe('hello');
    });

    it('should return text of exactly the caption limit unchanged', () => {
        const text = 'a'.repeat(TELEGRAM_CAPTION_MAX_LENGTH);

        expect(truncateTelegramCaption(text)).toBe(text);
    });

    it('should cut at the caption limit, not the message limit', () => {
        const result = truncateTelegramCaption('a'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH));

        expect(result).toHaveLength(TELEGRAM_CAPTION_MAX_LENGTH);
        expect(result.endsWith('…')).toBe(true);
    });

    it('should not leave a lone surrogate behind', () => {
        const text = `${'a'.repeat(TELEGRAM_CAPTION_MAX_LENGTH - 2)}${EMOJI}${EMOJI}`;

        expect(endsOnLoneSurrogate(truncateTelegramCaption(text).slice(0, -1))).toBe(false);
    });
});
