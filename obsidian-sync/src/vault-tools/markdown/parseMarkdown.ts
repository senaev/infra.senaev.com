import type { Root } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { sha256Hex } from 'senaev-utils/src/utils/crypto/sha256/sha256';
import { unified } from 'unified';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter);

/** The syntax tree of a note. Frontmatter is a `yaml` node, so it never looks like a heading. */
export function parseMarkdown(content: string): Root {
    return processor.parse(content);
}

/** Identifies one exact version of a note, so an edit can prove it saw the latest one. */
export function hashContent(content: string): string {
    return sha256Hex(content);
}

/** Maps a character offset to a 1-based line number. */
export function createLineLocator(content: string): (offset: number) => number {
    const lineStarts = [0];

    for (let index = content.indexOf('\n'); index !== -1; index = content.indexOf('\n', index + 1)) {
        lineStarts.push(index + 1);
    }

    return (offset) => {
        let low = 0;
        let high = lineStarts.length - 1;

        while (low < high) {
            const middle = Math.ceil((low + high) / 2);

            if ((lineStarts[middle] ?? 0) <= offset) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }

        return low + 1;
    };
}
