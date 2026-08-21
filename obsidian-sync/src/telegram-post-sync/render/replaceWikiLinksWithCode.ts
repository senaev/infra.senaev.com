const WIKI_LINK = /\[\[([^\]]*)\]\]/gm;

/**
 * Renders Obsidian wikilinks as inline code, mirroring the alias handling in
 * senaev.com's `replaceWikiLinksInTextWithRelativeLinks`:
 *
 *   [[@luli]]             ->  `@luli`
 *   [[note|Display text]] ->  `Display text`
 *
 * Inline code is deliberate rather than cosmetic: Telegram runs automatic entity
 * detection over rich message text, so a bare `@luli` would become a live mention
 * linking to whoever owns that username. Code spans are exempt from entity detection,
 * while phone numbers elsewhere in the note stay clickable.
 *
 * Must run after image embeds are resolved, otherwise it would match the `[[...]]`
 * inside an `![[...]]` embed.
 */
export function replaceWikiLinksWithCode(body: string): string {
    return body.replace(WIKI_LINK, (_match, inner: string) => {
        const parts = inner.split('|');
        const title = parts.length > 1 ? parts.slice(1).join('|') : inner;

        return `\`${title.trim()}\``;
    });
}
