/**
 * The longest text Telegram accepts in a message.
 *
 * The Bot API counts this *after entities parsing*, so markup does not eat into the budget:
 * MarkdownV2 escapes and HTML entities are longer as sent than as displayed. Measuring the
 * unescaped text against this limit is therefore correct, and errs on the safe side.
 */
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

const ELLIPSIS = '…';

/**
 * Shortens text to the longest a Telegram message may be, marking the cut with a single
 * ellipsis character.
 *
 * Telegram refuses an over-long message outright rather than trimming it, so text built from
 * an unbounded source — a directory listing, a stack trace — has to be cut before it is sent
 * or it never arrives at all. Callers that keep their own logs still have the full text.
 *
 * The limit is deliberately not configurable: a caller wanting a shorter message is choosing
 * a presentation, not avoiding a rejection, and should shorten its own content instead.
 */
export function truncateTelegramText(text: string): string {
    if (text.length <= TELEGRAM_MESSAGE_MAX_LENGTH) {
        return text;
    }

    return `${text.slice(0, TELEGRAM_MESSAGE_MAX_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`;
}
