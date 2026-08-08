/** Signals at a glance that a post is generated from the vault, not written by hand. */
export const PROVISIONED_MARKER = "🪨";

const HEADING = /^(#{1,6})[ \t]+(.*)$/;

/**
 * Prefixes the note's first heading with the provisioned marker:
 *
 *   # Syrniki 🍳  ->  # 🪨 Syrniki 🍳
 *
 * Notes without any heading get the marker as a standalone line instead, so the marker is
 * never silently dropped.
 */
export function markTitleAsProvisioned(body: string): string {
    const lines = body.split("\n");

    for (const [index, line] of lines.entries()) {
        const match = HEADING.exec(line);
        if (!match) {
            continue;
        }

        const [, hashes, title] = match;
        lines[index] = `${hashes} ${PROVISIONED_MARKER} ${title}`.trimEnd();

        return lines.join("\n");
    }

    return `${PROVISIONED_MARKER}\n\n${body}`;
}
