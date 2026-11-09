import { extractLinks } from '../../vault-tools/markdown/extractLinks';

/** Render Obsidian wikilinks as Telegram rich Markdown highlights, preserving code. */
export function replaceWikiLinksWithHighlights(body: string): string {
    let result = body;

    // Replace backwards so the original offsets remain valid.
    for (const link of extractLinks(body).reverse()) {
        if (link.kind !== 'wikilink' || link.embed) {
            continue;
        }

        const title = (link.displayText ?? link.raw.slice(2, -2)).trim();
        // Link labels are literal text, not Markdown nested inside the highlight.
        const escaped = title.replace(/[\\`*_[\]<>~|=]/g, '\\$&');
        const highlight = title === '' ? '' : `==${escaped}==`;

        result = result.slice(0, link.offset) + highlight + result.slice(link.offset + link.raw.length);
    }

    return result;
}
