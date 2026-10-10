import { ToolError } from 'senaev-utils/src/toolServer/ToolError';
import { createLineLocator } from 'senaev-utils/src/toolServer/textEdits';

import { parseMarkdown } from './parseMarkdown';

export type Section = {
    /** Every heading from the outermost ancestor down to this one. */
    headingPath: string[];
    depth: number;
    /** Offset where the heading line starts. */
    start: number;
    /** Offset right after the heading, where the section body starts. */
    bodyStart: number;
    /** Offset of the next heading of the same or a higher level, or the end of the note. */
    end: number;
    startLine: number;
    endLine: number;
};

type Heading = {
    text: string;
    depth: number;
    start: number;
    bodyStart: number;
};

/**
 * Takes the heading text from the source rather than from the parsed inline nodes, so
 * `## [[Link]] *notes*` is matched as written, the way Obsidian heading links refer to it.
 */
function headingText(content: string, start: number, end: number): string {
    const firstLine = content.slice(start, end).split('\n')[0] ?? '';

    return firstLine
        .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '')
        .replace(/[ \t]+#+[ \t]*$/, '')
        .trim();
}

/** Top-level headings only: a `#` line inside a list or a quote is not an Obsidian section. */
function collectHeadings(content: string): Heading[] {
    const headings: Heading[] = [];

    for (const node of parseMarkdown(content).children) {
        if (node.type !== 'heading' || node.position?.start.offset === undefined || node.position.end.offset === undefined) {
            continue;
        }

        headings.push({
            text: headingText(content, node.position.start.offset, node.position.end.offset),
            depth: node.depth,
            start: node.position.start.offset,
            bodyStart: node.position.end.offset,
        });
    }

    return headings;
}

export function collectSections(content: string): Section[] {
    const headings = collectHeadings(content);
    const lineOf = createLineLocator(content);
    const ancestors: Heading[] = [];

    return headings.map((heading, index) => {
        while (ancestors.length > 0 && (ancestors.at(-1)?.depth ?? 0) >= heading.depth) {
            ancestors.pop();
        }

        const next = headings.slice(index + 1).find((candidate) => candidate.depth <= heading.depth);
        const end = next?.start ?? content.length;
        const headingPath = [
            ...ancestors.map((ancestor) => ancestor.text),
            heading.text,
        ];

        ancestors.push(heading);

        return {
            headingPath,
            depth: heading.depth,
            start: heading.start,
            bodyStart: heading.bodyStart,
            end,
            startLine: lineOf(heading.start),
            endLine: lineOf(Math.max(heading.start, end - 1)),
        };
    });
}

function normalizeSegment(segment: string): string {
    return segment.replace(/^#+\s*/, '').trim().toLowerCase();
}

/** True when `wanted` appears in `path` in the same order, ending with the section itself. */
function matchesHeadingPath(path: string[], wanted: string[]): boolean {
    const normalizedPath = path.map(normalizeSegment);

    if (normalizedPath.at(-1) !== wanted.at(-1)) {
        return false;
    }

    let position = 0;

    for (const segment of wanted.slice(0, -1)) {
        const found = normalizedPath.indexOf(segment, position);

        if (found === -1 || found === normalizedPath.length - 1) {
            return false;
        }

        position = found + 1;
    }

    return true;
}

export function formatHeadingPath(path: string[]): string {
    return path.join(' > ');
}

/**
 * Finds one section by its heading, or by a heading path such as `Week 3 > Notes` when the
 * heading alone is not unique. Several matches are an error, never a guess.
 */
export function findSection(content: string, heading: string): Section {
    const wanted = heading.split('>').map(normalizeSegment).filter((segment) => segment !== '');

    if (wanted.length === 0) {
        throw new ToolError('invalid_arguments', 'The section heading must not be empty');
    }

    const sections = collectSections(content);
    const matches = sections.filter((section) => matchesHeadingPath(section.headingPath, wanted));

    if (matches.length === 0) {
        throw new ToolError('not_found', `No section with heading "${heading}"`, {
            availableHeadings: sections.map((section) => formatHeadingPath(section.headingPath)),
        });
    }

    if (matches.length > 1) {
        throw new ToolError('ambiguous', `Several sections match "${heading}"; use a heading path such as "Parent > Heading"`, {
            candidates: matches.map((section) => {
                return {
                    headingPath: formatHeadingPath(section.headingPath),
                    startLine: section.startLine,
                };
            }),
        });
    }

    return matches[0] as Section;
}
