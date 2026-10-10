import { isObject } from 'senaev-utils/src/types/Object/Object';
import { parse } from 'yaml';

import { stripFrontmatter } from './stripFrontmatter';

/** The frontmatter of a note as an object, or `null` when it has none. Throws for bad YAML. */
export function parseNoteFrontmatter(content: string): Record<string, unknown> | null {
    const { frontmatter } = stripFrontmatter(content.replaceAll('\r\n', '\n'));

    if (frontmatter === '') {
        return null;
    }

    // Obsidian accepts a repeated key, so the parser must not reject the whole note for it.
    const parsed: unknown = parse(frontmatter, { uniqueKeys: false });

    return isObject(parsed) && !Array.isArray(parsed) ? parsed : null;
}
