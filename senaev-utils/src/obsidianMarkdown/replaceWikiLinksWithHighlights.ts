import { ExtractedLink, extractLinks } from './extractLinks';

const HIGHLIGHT_MARKER = /(?<!\\)==/g;

/** The body with every link blanked out, so `==` inside a link label is not a highlight marker. */
function maskLinks(body: string, links: ExtractedLink[]): string {
    let masked = body;

    for (const link of links) {
        masked = masked.slice(0, link.offset) + ' '.repeat(link.raw.length) + masked.slice(link.offset + link.raw.length);
    }

    return masked;
}

/** True when the line before `offset` opens an `==highlight==` that is not closed yet. */
function isInsideHighlight(masked: string, offset: number): boolean {
    const lineStart = masked.lastIndexOf('\n', offset - 1) + 1;
    const markers = masked.slice(lineStart, offset).match(HIGHLIGHT_MARKER)?.length ?? 0;

    return markers % 2 === 1;
}

/** Render Obsidian wikilinks as Telegram rich Markdown highlights, preserving code. */
export function replaceWikiLinksWithHighlights(body: string): string {
    const links = extractLinks(body);
    const masked = maskLinks(body, links);
    let result = body;

    // Replace backwards so the original offsets remain valid.
    for (const link of links.reverse()) {
        if (link.kind !== 'wikilink' || link.embed) {
            continue;
        }

        const title = (link.displayText ?? link.raw.slice(2, -2)).trim();
        // Link labels are literal text, not Markdown nested inside the highlight.
        const escaped = title.replace(/[\\`*_[\]<>~|=]/g, '\\$&');
        // A link that the note already highlights, as in `==[[Note]]==`, keeps that
        // highlight: another `==` pair inside it would show up as literal `==`.
        const highlight = title === '' || isInsideHighlight(masked, link.offset) ? escaped : `==${escaped}==`;

        result = result.slice(0, link.offset) + highlight + result.slice(link.offset + link.raw.length);
    }

    return result;
}
