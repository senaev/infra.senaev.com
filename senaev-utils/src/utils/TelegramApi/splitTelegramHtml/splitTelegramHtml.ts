import { TELEGRAM_MESSAGE_MAX_LENGTH } from '../truncateTelegramText/truncateTelegramText';

/**
 * Splits Telegram HTML into complete, independently valid messages without dropping text.
 * Supports the tags emitted by formatTelegramHtml (bold and expandable blockquote),
 * plus the named entities emitted by escapeHtml. Counts visible UTF-16 units, not markup.
 */
export function splitTelegramHtml(html: string): string[] {
    const parts: string[] = [];
    const openTags: Array<{ open: string; close: string }> = [];
    let current = '';
    let visibleLength = 0;

    const tokens = html.match(/<blockquote expandable>|<\/blockquote>|<b>|<\/b>|&(?:lt|gt|amp|quot);|[\s\S]/gu) ?? [];

    for (const token of tokens) {
        if (token === '<b>' || token === '<blockquote expandable>') {
            openTags.push({
                open: token,
                close: token === '<b>' ? '</b>' : '</blockquote>',
            });
        } else if (token === '</b>' || token === '</blockquote>') {
            openTags.pop();
        } else {
            const tokenLength = token.startsWith('&') && token.endsWith(';') ? 1 : token.length;

            if (visibleLength + tokenLength > TELEGRAM_MESSAGE_MAX_LENGTH && visibleLength > 0) {
                parts.push(current + openTags.map(({ close }) => close).reverse().join(''));
                // Reopen formatting on the next message. The token itself has not been consumed.
                current = openTags.map(({ open }) => open).join('');
                visibleLength = 0;
            }

            visibleLength += tokenLength;
        }

        current += token;
    }

    if (current !== '') {
        parts.push(current);
    }

    return parts;
}
