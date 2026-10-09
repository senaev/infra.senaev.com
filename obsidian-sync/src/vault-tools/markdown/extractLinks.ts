import type { Nodes } from 'mdast';

import { createLineLocator, parseMarkdown } from './parseMarkdown';

export type LinkSubpath = {
    type: 'heading' | 'block';
    value: string;
};

export type ExtractedLink = {
    kind: 'wikilink' | 'markdown';
    embed: boolean;
    /** The link exactly as written in the note. */
    raw: string;
    line: number;
    /** The note or file part as written, `''` for a link inside the same note. */
    target: string;
    subpath: LinkSubpath | null;
    displayText: string | null;
    /** Set for `https:`, `mailto:` and similar links, which point outside the vault. */
    externalUrl: string | null;
};

const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:|^\/\//i;

function parseSubpath(value: string): LinkSubpath | null {
    if (value === '') {
        return null;
    }

    if (value.startsWith('^')) {
        return {
            type: 'block',
            value: value.slice(1),
        };
    }

    return {
        type: 'heading',
        // `[[Note#A#B]]` points at heading B nested under A.
        value: value.split('#').map((part) => part.trim()).filter(Boolean).join(' > '),
    };
}

function splitTargetAndSubpath(value: string): { target: string; subpath: LinkSubpath | null } {
    const hashIndex = value.indexOf('#');

    return hashIndex === -1
        ? {
            target: value.trim(),
            subpath: null,
        }
        : {
            target: value.slice(0, hashIndex).trim(),
            subpath: parseSubpath(value.slice(hashIndex + 1)),
        };
}

function decodeUrlPath(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

/**
 * Code is masked with spaces of the same length, so a `[[link]]` inside a code block is not
 * a link but the offsets of everything else stay valid.
 */
function maskCode(content: string, root: Nodes): string {
    const parts: string[] = [];
    let position = 0;

    const visit = (node: Nodes): void => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;

        if ((node.type === 'code' || node.type === 'inlineCode') && start !== undefined && end !== undefined) {
            // Newlines are kept, so a wikilink can never match across a masked block.
            parts.push(content.slice(position, start), content.slice(start, end).replace(/[^\n]/g, ' '));
            position = end;

            return;
        }

        if ('children' in node) {
            node.children.forEach(visit);
        }
    };

    visit(root);
    parts.push(content.slice(position));

    return parts.join('');
}

/**
 * Every link in a note: wikilinks and embeds (`[[Note#Heading|Alias]]`, `![[image.png]]`,
 * `[[#^block]]`), Markdown links, images and reference definitions. Links in frontmatter
 * properties count too, as they do in Obsidian; links in code do not.
 */
export function extractLinks(content: string): ExtractedLink[] {
    const root = parseMarkdown(content);
    const lineOf = createLineLocator(content);
    const links: { offset: number; link: ExtractedLink }[] = [];

    for (const match of maskCode(content, root).matchAll(WIKILINK)) {
        const inner = (match[2] ?? '').replaceAll('\\|', '|');
        const pipeIndex = inner.indexOf('|');
        const destination = pipeIndex === -1 ? inner : inner.slice(0, pipeIndex);

        links.push({
            offset: match.index,
            link: {
                kind: 'wikilink',
                embed: match[1] === '!',
                raw: match[0],
                line: lineOf(match.index),
                ...splitTargetAndSubpath(destination),
                displayText: pipeIndex === -1 ? null : inner.slice(pipeIndex + 1).trim(),
                externalUrl: null,
            },
        });
    }

    const visit = (node: Nodes): void => {
        if ((node.type === 'link' || node.type === 'image' || node.type === 'definition') && node.position?.start.offset !== undefined) {
            const { url } = node;
            const isExternal = URL_SCHEME.test(url);
            const raw = content.slice(node.position.start.offset, node.position.end.offset);

            links.push({
                offset: node.position.start.offset,
                link: {
                    kind: 'markdown',
                    embed: node.type === 'image',
                    raw,
                    line: lineOf(node.position.start.offset),
                    ...isExternal
                        ? {
                            target: url,
                            subpath: null,
                        }
                        : splitTargetAndSubpath(decodeUrlPath(url)),
                    displayText: node.type === 'definition' ? node.label ?? null : null,
                    externalUrl: isExternal ? url : null,
                },
            });
        }

        if ('children' in node) {
            node.children.forEach(visit);
        }
    };

    visit(root);

    return links.sort((a, b) => a.offset - b.offset).map(({ link }) => link);
}
