import { escapeHtml } from '../../String/escapeHtml/escapeHtml';

/**
 * Builders for the Telegram HTML parse mode.
 *
 * Each one escapes its own content, so callers pass raw text and never think about escaping.
 * That is the whole reason these exist: Telegram rejects the entire message when markup does
 * not parse, so a missed escape is a message that never arrives, and the safest place to put
 * the escape is inside the thing that emits the tag.
 *
 * Telegram accepts only a fixed set of tags — anything else is a 400, not an ignored tag — so
 * this file is the closed list of what the parse mode can express, minus the entities no
 * caller here needs (underline, strikethrough, spoiler, plain blockquote, custom emoji).
 */

/** Wraps text in bold, escaping it. */
export function telegramBold(text: string): string {
    return `<b>${escapeHtml(text)}</b>`;
}

/** Wraps text in italics, escaping it. */
export function telegramItalic(text: string): string {
    return `<i>${escapeHtml(text)}</i>`;
}

/**
 * Wraps text in inline fixed-width code, escaping it.
 *
 * Telegram escapes `<`, `>` and `&` inside a code entity exactly as it does outside one, so
 * this needs no special case. The MarkdownV2 equivalent did: there, only the backtick and the
 * backslash are escaped inside code, and the other sixteen reserved characters must be left
 * alone, which needed a second escape function next to the general one.
 */
export function telegramCode(text: string): string {
    return `<code>${escapeHtml(text)}</code>`;
}

/**
 * Builds a link, escaping both the text and the URL.
 *
 * The URL is escaped as an attribute value: `escapeHtml` covers `"` along with `&`, and the
 * quotes here are double, so an ampersand in a query string cannot end the attribute early.
 */
export function telegramLink({ text, url }: { text: string; url: string }): string {
    return `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
}

/**
 * Builds a collapsed-by-default quotation from lines, escaping each of them.
 *
 * Useful for the bulky half of a report — timings, raw errors — which is worth keeping but not
 * worth the screen space every time.
 */
export function telegramExpandableBlockquote(lines: string[]): string {
    return `<blockquote expandable>${lines.map(escapeHtml).join('\n')}</blockquote>`;
}
