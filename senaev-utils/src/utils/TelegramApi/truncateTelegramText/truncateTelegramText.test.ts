import {
    describe,
    expect,
    it,
} from 'vitest';

import { TELEGRAM_MESSAGE_MAX_LENGTH, truncateTelegramText } from './truncateTelegramText';

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
});
