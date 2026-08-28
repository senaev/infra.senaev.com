/**
 * The longest text Telegram accepts in a message.
 *
 * The Bot API counts this *after entities parsing*, so markup does not eat into the budget:
 * HTML entities and escapes are longer as sent than as displayed. Measuring the unescaped
 * text against this limit is therefore correct, and errs on the safe side.
 */
export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

/**
 * The longest caption Telegram accepts on a media message — a quarter of a text message.
 *
 * Separate because the two are separate API limits, not presentation choices: a caption of
 * 4096 is rejected outright even though the same text would be fine in a message.
 */
export const TELEGRAM_CAPTION_MAX_LENGTH = 1024;

const ELLIPSIS = '…';

/**
 * Cuts to `end` UTF-16 code units without leaving a lone surrogate behind.
 *
 * Telegram measures in UTF-16 code units, which is what `String.length` counts, so the budget
 * arithmetic is already right. Cutting at an arbitrary index is not: any character outside the
 * BMP — every emoji — is a surrogate *pair*, and a cut between its halves leaves an unpaired
 * high surrogate, which is not valid text.
 *
 * Only the pair is repaired here. A cut through a longer cluster — a ZWJ emoji family, a skin
 * tone modifier, a flag — yields valid text that merely renders as its pieces, so it is left
 * alone rather than paid for with grapheme segmentation.
 */
function sliceWholeCharacters(text: string, end: number): string {
    const lastUnit = text.charCodeAt(end - 1);
    const endsOnHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;

    // The matching low surrogate sits at `end`, which this cut excludes, so the high half has
    // to go with it.
    return text.slice(0, endsOnHighSurrogate ? end - 1 : end);
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }

    return `${sliceWholeCharacters(text, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
}

/**
 * Shortens text to the longest a Telegram message may be, marking the cut with a single
 * ellipsis character.
 *
 * Telegram refuses an over-long message outright rather than trimming it, so text built from
 * an unbounded source — a directory listing, a stack trace — has to be cut before it is sent
 * or it never arrives at all. Callers that keep their own logs still have the full text.
 *
 * Truncate before escaping, never after: a cut through an escape sequence can leave markup
 * Telegram then refuses to parse. Escaping last is also why the budget is measured here on the
 * unescaped text, which is what Telegram counts.
 *
 * The limit is deliberately not a parameter: a caller wanting a shorter message is choosing a
 * presentation, not avoiding a rejection, and should shorten its own content instead. Use
 * `truncateTelegramCaption` for a media caption, whose limit is a different API limit rather
 * than a different presentation.
 */
export function truncateTelegramText(text: string): string {
    return truncate(text, TELEGRAM_MESSAGE_MAX_LENGTH);
}

/**
 * Shortens text to the longest a Telegram media caption may be.
 *
 * Same contract as `truncateTelegramText`, against the caption limit. Passing caption text
 * through the message variant is a latent rejection: it stays under 4096 and Telegram still
 * refuses it at 1024.
 */
export function truncateTelegramCaption(text: string): string {
    return truncate(text, TELEGRAM_CAPTION_MAX_LENGTH);
}
