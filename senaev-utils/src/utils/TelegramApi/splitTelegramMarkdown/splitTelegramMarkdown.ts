/** Conservative byte budget for the rich-message text and its formatting wrappers. */
export const TELEGRAM_RICH_MESSAGE_MAX_LENGTH = 32_768;
const CONTENT_BUDGET = TELEGRAM_RICH_MESSAGE_MAX_LENGTH - 256;
const MAX_LINES_PER_PART = 250; // Rich messages also have a 500-block limit.
const DETAILS_OPEN = '<details><summary>Details</summary>';

/**
 * Divide Rich Markdown at line boundaries, preserving fenced code and collapsible details.
 * Extremely long lines are divided by Unicode code point, never through a surrogate pair or
 * an escaped punctuation character. Formatting wrappers are restored on each side of a cut.
 */
export function splitTelegramMarkdown(markdown: string): string[] {
    if (markdown === '') {
        throw new Error('Cannot send an empty Telegram rich message');
    }

    const chunks: string[] = [];
    let chunk = '';
    let chunkBytes = 0;
    const inlineStyles: string[] = [];
    let lineCount = 0;
    let fence: string | undefined;
    let inDetails = false;

    function flush(): void {
        if (chunk === '') {
            return;
        }

        const suffix = `${inlineStyles.toReversed().join('')}${fence ? `\n${fence}` : ''}${inDetails ? '\n</details>' : ''}`;

        chunks.push(chunk + suffix);
        chunk = `${inDetails ? `${DETAILS_OPEN}\n\n` : ''}${fence ? `${fence}\n` : ''}${inlineStyles.join('')}`;
        chunkBytes = Buffer.byteLength(chunk);
        lineCount = 0;
    }

    function append(text: string): void {
        // Escapes and formatting delimiters are indivisible tokens. When a long formatted
        // line is split, close active styles at the cut and reopen them in the next part.
        for (const [token] of text.matchAll(/\\[^\n]|\*\*|\*|[^\n]|\n/gu)) {
            const bytes = Buffer.byteLength(token);

            if (chunk && chunkBytes + bytes > CONTENT_BUDGET) {
                flush();
            }

            if (chunkBytes + bytes > CONTENT_BUDGET) {
                throw new Error('Telegram Markdown formatting wrapper exceeds the message limit');
            }

            chunk += token;
            chunkBytes += bytes;

            if (!fence && (token === '**' || token === '*')) {
                if (inlineStyles.at(-1) === token) {
                    inlineStyles.pop();
                } else {
                    inlineStyles.push(token);
                }
            }
        }
    }

    for (const line of markdown.match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
        const lineWithoutNewline = line.replace(/\n$/u, '');

        if (chunk && (Buffer.byteLength(chunk + line) > CONTENT_BUDGET || lineCount >= MAX_LINES_PER_PART)) {
            flush();
        }

        append(line);
        lineCount++;

        const trimmed = lineWithoutNewline.trim();

        if (trimmed.startsWith(DETAILS_OPEN)) {
            inDetails = true;
        } else if (trimmed === '</details>') {
            inDetails = false;
        }

        const marker = trimmed.match(/^(`{3,}|~{3,})(?:[^`~]*)$/u)?.[1];

        if (marker) {
            if (!fence) {
                fence = marker;
            } else if (marker[0] === fence[0] && marker.length >= fence.length) {
                fence = undefined;
            }
        }
    }

    if (chunk !== '') {
        chunks.push(chunk);
    }

    return chunks;
}
