import type { Nodes } from 'mdast';
import { parseMarkdown } from 'senaev-utils/src/obsidianMarkdown/parseMarkdown';

function addSoftBreakLines(lines: Set<number>, startLine: number, endLine: number): void {
    for (let line = startLine; line < endLine; line++) {
        lines.add(line);
    }
}

function collectSoftBreakLines(node: Nodes, lines: Set<number>, inParagraph: boolean): void {
    const { position } = node;

    if (position === undefined) {
        return;
    }

    if (inParagraph && node.type === 'text') {
        addSoftBreakLines(lines, position.start.line, position.end.line);
    }

    if (!('children' in node)) {
        return;
    }

    const inParagraphContent = inParagraph || node.type === 'paragraph';
    let previousEndLine = position.start.line;
    let hasUnpositionedText = false;

    // GFM autolinks can split a text node into children without source positions.
    // Their source range runs between the nearest positioned siblings or parent bounds.
    for (const child of node.children) {
        if (child.position === undefined) {
            hasUnpositionedText = inParagraphContent;
            continue;
        }

        if (hasUnpositionedText) {
            addSoftBreakLines(lines, previousEndLine, child.position.start.line);
        }

        collectSoftBreakLines(child, lines, inParagraphContent);
        previousEndLine = child.position.end.line;
        hasUnpositionedText = false;
    }

    if (hasUnpositionedText) {
        addSoftBreakLines(lines, previousEndLine, position.end.line);
    }
}

/** Make paragraph soft breaks explicit in the Markdown sent to Telegram. */
export function preserveParagraphLineBreaks(markdown: string): string {
    const softBreakLines = new Set<number>();

    collectSoftBreakLines(parseMarkdown(markdown), softBreakLines, false);

    if (softBreakLines.size === 0) {
        return markdown;
    }

    // Captured line endings occupy the odd indexes, preserving LF and CRLF as written.
    const parts = markdown.split(/(\r\n?|\n)/);

    for (const line of softBreakLines) {
        const index = (line - 1) * 2;

        // Two trailing spaces are a Markdown hard break. Normalize even a trailing tab.
        parts[index] = (parts[index] ?? '').replace(/[ \t]*$/, '  ');
    }

    return parts.join('');
}
