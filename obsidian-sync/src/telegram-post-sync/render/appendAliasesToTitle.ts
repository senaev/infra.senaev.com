import { HEADING } from "./markTitleAsProvisioned";

/**
 * Renders each frontmatter alias as its own heading directly beneath the note's title,
 * at the same heading level:
 *
 *   # 🪨 Syrniki 🍳
 *   # Сырники
 *
 * The point is text search — aliases are how you'd look the post up in Telegram, but they
 * usually don't appear anywhere in the note body.
 *
 * Runs after markTitleAsProvisioned, which guarantees a first heading exists to anchor to.
 */
export function appendAliasesToTitle(body: string, aliases: string[]): string {
    if (aliases.length === 0) {
        return body;
    }

    const lines = body.split("\n");

    for (const [index, line] of lines.entries()) {
        const match = HEADING.exec(line);
        if (!match) {
            continue;
        }

        const [, hashes] = match;
        const aliasHeadings = aliases.map((alias) => `${hashes} ${alias}`);
        lines.splice(index + 1, 0, ...aliasHeadings);

        return lines.join("\n");
    }

    return body;
}
