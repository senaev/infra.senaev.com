/** Escape untrusted text for Telegram Rich Markdown (GFM), not legacy MarkdownV2. */
export function escapeTelegramMarkdown(text: string): string {
    return text.replace(/[\\`*_{}[\]()#+\-.!|><=~$]/gu, '\\$&');
}

export function telegramBold(text: string): string {
    return `**${escapeTelegramMarkdown(text)}**`;
}

export function telegramItalic(text: string): string {
    return `*${escapeTelegramMarkdown(text)}*`;
}

/** A CommonMark code span uses a delimiter longer than any run of backticks in the content. */
export function telegramCode(text: string): string {
    if (text.includes('\n')) {
        return telegramCodeBlock(text);
    }

    const longest = Math.max(0, ...Array.from(text.matchAll(/`+/gu), ([run]) => run.length));
    const fence = '`'.repeat(longest + 1);
    const padding = text.includes('`') || text.startsWith(' ') || text.endsWith(' ') ? ' ' : '';

    return `${fence}${padding}${text}${padding}${fence}`;
}

export function telegramCodeBlock(text: string): string {
    const longest = Math.max(2, ...Array.from(text.matchAll(/`+/gu), ([run]) => run.length));
    const fence = '`'.repeat(longest + 1);

    return `${fence}\n${text}\n${fence}`;
}

export function telegramLink({ text, url }: { text: string; url: string }): string {
    // No executable or untrusted schemes in a clickable Telegram URL.
    if (!/^(?:https?:\/\/|tg:\/\/|mailto:|tel:)/iu.test(url)) {
        return escapeTelegramMarkdown(text);
    }

    const encodedUrl = encodeURI(url).replaceAll('(', '%28').replaceAll(')', '%29');

    return `[${escapeTelegramMarkdown(text)}](${encodedUrl})`;
}

/** Rich Markdown has no pure-Markdown collapsible syntax; its supported details block does. */
export function telegramExpandableBlockquote(lines: string[]): string {
    return `<details><summary>Details</summary>\n\n${lines.map(escapeTelegramMarkdown).join('  \n')}\n</details>`;
}
