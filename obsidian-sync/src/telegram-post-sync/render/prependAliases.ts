/** Separator between aliases on the single header line. */
const ALIAS_SEPARATOR = " • ";

/**
 * Puts the note's frontmatter aliases on one line at the top of the post, followed by a
 * divider, so they're reachable by Telegram's text search.
 *
 * `<hr/>` is used rather than `---` on purpose: markdown would read `text` followed by
 * `---` as a setext heading, turning the alias line into an H2 instead of drawing a rule.
 * The tag is a supported rich-message tag and maps to a divider block.
 *
 * Blank lines around the divider keep it a block of its own rather than being absorbed
 * into the surrounding paragraph.
 */
export function prependAliases(body: string, aliases: string[]): string {
    if (aliases.length === 0) {
        return body;
    }

    return `${aliases.join(ALIAS_SEPARATOR)}\n\n<hr/>\n\n${body}`;
}
