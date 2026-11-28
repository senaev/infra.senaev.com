import type { Nodes } from 'mdast';
import { parseMarkdown } from 'senaev-utils/src/obsidianMarkdown/parseMarkdown';

function collectSoftBreakLines(node: Nodes, lines: Set<number>, inParagraph: boolean): void {
    if (inParagraph && node.type === 'text' && node.position !== undefined) {
        for (let { line } = node.position.start; line < node.position.end.line; line++) {
            lines.add(line);
        }
    }

    if ('children' in node) {
        for (const child of node.children) {
            collectSoftBreakLines(child, lines, inParagraph || node.type === 'paragraph');
        }
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
