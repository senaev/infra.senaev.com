import { posix } from 'node:path';

import type { ExtractedLink } from './extractLinks';
import { type LinkIndex, resolveLink } from './resolveLink';

export type TextEdit = {
    start: number;
    end: number;
    text: string;
};

const NOTE_EXTENSION = '.md';
const DEFINITION_DESTINATION = /^(\[[^\]]*\]:[ \t]*)(<[^>\n]*>|\S+)/;
const INLINE_DESTINATION = /\]\([ \t]*(<[^>\n]*>|[^\s)]+)/g;

function withoutNoteExtension(path: string): string {
    return path.endsWith(NOTE_EXTENSION) ? path.slice(0, -NOTE_EXTENSION.length) : path;
}

/** The shortest form first, as Obsidian writes it: the name, then the path, then the path from the vault root. */
function wikilinkTargetCandidates(targetPath: string): string[] {
    const path = withoutNoteExtension(targetPath);

    return [
        posix.basename(path),
        path,
        `/${path}`,
    ];
}

/** Only the target part changes, so `#heading`, `^block`, `|display text` and `!` stay as written. */
function rewriteWikilink(index: LinkIndex, sourcePath: string, link: ExtractedLink, targetPath: string): TextEdit | null {
    const prefixLength = link.embed ? '![['.length : '[['.length;
    const inner = link.raw.slice(prefixLength, -']]'.length);
    // The target ends at the first `#`, `|`, or `\|` (the escaped pipe of a link in a table).
    const targetEnd = inner.search(/#|\\?\|/);
    const written = targetEnd === -1 ? inner : inner.slice(0, targetEnd);
    const text = wikilinkTargetCandidates(targetPath).find((candidate) => {
        const resolution = resolveLink(index, sourcePath, {
            ...link,
            target: candidate,
        });

        return resolution.status === 'resolved' && resolution.path === targetPath;
    });

    if (text === undefined) {
        return null;
    }

    const start = link.offset + prefixLength + written.length - written.trimStart().length;

    return {
        start,
        end: link.offset + prefixLength + written.trimEnd().length,
        text,
    };
}

function findMarkdownDestination(raw: string): { start: number; written: string } | null {
    const definition = DEFINITION_DESTINATION.exec(raw);

    if (definition !== null) {
        return {
            start: (definition[1] ?? '').length,
            written: definition[2] ?? '',
        };
    }

    // The last one, because the text of a link can hold an image: `[![alt](a.png)](Note.md)`.
    const inline = [...raw.matchAll(INLINE_DESTINATION)].at(-1);

    if (inline === undefined) {
        return null;
    }

    const written = inline[1] ?? '';

    return {
        start: inline.index + inline[0].length - written.length,
        written,
    };
}

/** As Obsidian writes them; `(` and `)` are encoded too, because they can end the link early. */
function encodeLinkPath(path: string): string {
    return path
        .split('/')
        .map((segment) => encodeURI(segment).replace(/[#?()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`))
        .join('/');
}

/** Markdown links are relative to their note; only the path part changes, `#heading` stays. */
function rewriteMarkdownLink(sourcePath: string, link: ExtractedLink, targetPath: string): TextEdit | null {
    const destination = findMarkdownDestination(link.raw);

    if (destination === null) {
        return null;
    }

    const isAngled = destination.written.startsWith('<');
    const pathAndSubpath = isAngled ? destination.written.slice(1, -1) : destination.written;
    const hashIndex = pathAndSubpath.indexOf('#');
    const start = link.offset + destination.start + (isAngled ? 1 : 0);
    const relativePath = posix.relative(posix.dirname(sourcePath), targetPath);

    return {
        start,
        end: start + (hashIndex === -1 ? pathAndSubpath.length : hashIndex),
        text: isAngled ? relativePath : encodeLinkPath(relativePath),
    };
}

/** True when the link, read as a path relative to its note, names `targetPath`. */
export function pointsRelativelyAt(sourcePath: string, link: ExtractedLink, targetPath: string): boolean {
    const joined = posix.normalize(posix.join(posix.dirname(sourcePath), link.target)).toLowerCase();
    const target = targetPath.toLowerCase();

    return joined === target || `${joined}${NOTE_EXTENSION}` === target;
}

/**
 * The edit that makes the link in `sourcePath` point at `targetPath` again, judged by the
 * index of the vault after the change. `null` when the link cannot be rewritten safely.
 */
export function rewriteLinkTarget(index: LinkIndex, sourcePath: string, link: ExtractedLink, targetPath: string): TextEdit | null {
    return link.kind === 'wikilink'
        ? rewriteWikilink(index, sourcePath, link, targetPath)
        : rewriteMarkdownLink(sourcePath, link, targetPath);
}

/** Applies edits that do not overlap; they are applied from the end, so the offsets stay valid. */
export function applyTextEdits(content: string, edits: readonly TextEdit[]): string {
    return [...edits]
        .sort((a, b) => b.start - a.start)
        .reduce((result, edit) => `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`, content);
}
