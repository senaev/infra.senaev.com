/** Telegram rich-message limit. Using UTF-8 bytes is conservative for Unicode text. */
export const TELEGRAM_RICH_MESSAGE_MAX_LENGTH = 32_768;

/** Split formatted rich HTML without losing characters or breaking formatting and escapes. */
export function splitTelegramHtml(html: string): string[] {
    const chunks: string[] = [];
    const tags: Array<{ open: string; close: string }> = [];
    let chunk = '';
    let chunkBytes = 0;
    let hasContent = false;

    const tokens = html.match(/<blockquote expandable>|<\/blockquote>|<\/?(?:b|i|pre|code)>|&(?:lt|gt|amp|quot);|[\s\S]/gu) ?? [];

    for (const token of tokens) {
        const opening = /^<(?:b|i|pre|code|blockquote expandable)>$/u.test(token);
        const closing = /^<\//u.test(token);
        const nextTags = [...tags];

        if (opening) {
            const name = token.match(/^<(\w+)/u)?.[1];

            nextTags.push({
                open: token,
                close: `</${name}>`,
            });
        } else if (closing) {
            nextTags.pop();
        }

        const suffix = nextTags.map(({ close }) => close).reverse().join('');
        const tokenBytes = Buffer.byteLength(token);

        if (hasContent && chunkBytes + tokenBytes + Buffer.byteLength(suffix) > TELEGRAM_RICH_MESSAGE_MAX_LENGTH) {
            chunk += tags.map(({ close }) => close).reverse().join('');
            chunks.push(chunk);
            chunk = tags.map(({ open }) => open).join('');
            chunkBytes = Buffer.byteLength(chunk);
            hasContent = false;
        }

        chunk += token;
        chunkBytes += tokenBytes;
        hasContent ||= !opening && !closing;
        tags.splice(0, tags.length, ...nextTags);
    }

    if (chunk !== '') {
        chunks.push(chunk);
    }

    return chunks;
}
