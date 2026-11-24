import type { Root } from 'mdast';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter);

/** The syntax tree of a note. Frontmatter is a `yaml` node, so it never looks like a heading. */
export function parseMarkdown(content: string): Root {
    return processor.parse(content);
}
