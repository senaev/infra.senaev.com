import {
    ExtractedLink, extractLinks, maskCode,
} from './extractLinks';
import { parseMarkdown } from './parseMarkdown';

const HIGHLIGHT_MARKER = /(?<!\\)==/g;

/**
 * The body with every link and code span blanked out, so `==` inside a link label or
 * inside code is not a highlight marker.
 */
function maskLinksAndCode(body: string, links: ExtractedLink[]): string {
    let masked = maskCode(body, parseMarkdown(body));

    for (const link of links) {
        // Newlines are kept: a Markdown link can span lines, and the line of a wikilink
        // must not start before them.
        const blank = link.raw.replace(/[^\n]/g, ' ');

        masked = masked.slice(0, link.offset) + blank + masked.slice(link.offset + link.raw.length);
    }

    return masked;
}

/**
 * True when `offset` is inside an `==highlight==` of its line: between an opening `==`
 * and the closing one. Markers are paired from the line start, so an unmatched `==`
 * opens nothing.
 */
function isInsideHighlight(masked: string, offset: number): boolean {
    const lineStart = masked.lastIndexOf('\n', offset - 1) + 1;
    const lineEnd = masked.indexOf('\n', offset);
    const line = masked.slice(lineStart, lineEnd === -1 ? masked.length : lineEnd);
    const markers = [...line.matchAll(HIGHLIGHT_MARKER)].map((match) => lineStart + match.index);

    for (let index = 0; index + 1 < markers.length; index += 2) {
        const open = markers[index] ?? 0;
        const close = markers[index + 1] ?? 0;

        if (open < offset && offset < close) {
            return true;
        }
    }

    return false;
}

/** Render Obsidian wikilinks as Telegram rich Markdown highlights, preserving code. */
export function replaceWikiLinksWithHighlights(body: string): string {
    const links = extractLinks(body);

    if (links.length === 0) {
        return body;
    }

    const masked = maskLinksAndCode(body, links);
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
