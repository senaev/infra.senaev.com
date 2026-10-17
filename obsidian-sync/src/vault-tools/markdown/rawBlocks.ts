import type { Node, Parent } from 'mdast';

import { parseMarkdown } from './parseMarkdown';

export type RawBlockKind = 'yaml' | 'code' | 'html' | 'table';

/** A block whose lines are not Markdown text: a task line in it is not a task. */
export type RawBlock = {
    kind: RawBlockKind;
    /** 1-based, inclusive. */
    startLine: number;
    endLine: number;
};

const RAW_BLOCK_KINDS: ReadonlySet<string> = new Set<RawBlockKind>([
    'yaml',
    'code',
    'html',
    'table',
]);

function collect(node: Node, blocks: RawBlock[]): void {
    if (RAW_BLOCK_KINDS.has(node.type) && node.position !== undefined) {
        blocks.push({
            kind: node.type as RawBlockKind,
            startLine: node.position.start.line,
            endLine: node.position.end.line,
        });

        return;
    }

    for (const child of (node as Partial<Parent>).children ?? []) {
        collect(child, blocks);
    }
}

/** Frontmatter, code blocks, HTML blocks and tables, at any depth (lists, callouts). */
export function findRawBlocks(content: string): RawBlock[] {
    const blocks: RawBlock[] = [];

    collect(parseMarkdown(content), blocks);

    return blocks;
}

export function isLineInRawBlock(blocks: readonly RawBlock[], line: number): boolean {
    return blocks.some((block) => block.startLine <= line && line <= block.endLine);
}
