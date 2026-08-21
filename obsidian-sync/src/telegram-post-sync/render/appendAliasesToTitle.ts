import { HEADING } from './markTitleAsProvisioned';

/** Separates the real title from each alias inside the title line. */
const ALIAS_SEPARATOR = ' • ';

/**
 * Appends the note's frontmatter aliases onto the title line itself:
 *
 *   # 🪨 Syrniki 🍳 • Сырники • Cheese Pancakes
 *
 * The point is text search — aliases are how you'd look the post up in Telegram, but they
 * usually appear nowhere in the note body.
 *
 * Runs after markTitleAsProvisioned, which guarantees a first heading exists to append to.
 */
export function appendAliasesToTitle(body: string, aliases: string[]): string {
    if (aliases.length === 0) {
        return body;
    }

    const lines = body.split('\n');

    for (const [
        index,
        line,
    ] of lines.entries()) {
        const match = HEADING.exec(line);

        if (!match) {
            continue;
        }

        const [
            , hashes,
            title,
        ] = match;
        const parts = [
            title,
            ...aliases,
        ].filter((part) => part !== undefined && part !== '');

        lines[index] = `${hashes} ${parts.join(ALIAS_SEPARATOR)}`;

        return lines.join('\n');
    }

    return body;
}
