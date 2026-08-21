/**
 * Escapes the characters that must not appear literally in HTML text or inside
 * a double-quoted attribute value.
 *
 * `&` is replaced first, otherwise the ampersands introduced by the later
 * replacements would be escaped again and produce `&amp;lt;`.
 *
 * The apostrophe is deliberately left alone. The main consumer is Telegram's
 * HTML parse mode, whose documented entity set is `&lt;`, `&gt;`, `&amp;` and
 * `&quot;` only; emitting `&#39;` risks it being shown verbatim to the reader,
 * and apostrophes are common in ordinary text. Every attribute this output
 * feeds is double-quoted, so escaping `"` is sufficient there.
 */
export function escapeHtml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
