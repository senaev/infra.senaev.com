import { createHash } from 'node:crypto';

import type { ResolvedEmbed } from './render/resolveImageEmbeds';

/** Long enough that a collision is not a practical concern, short enough to sit in a note. */
const HASH_LENGTH = 16;

export type HashInput = {
    markdown: string;
    media: ResolvedEmbed[];
    /** The posts this content was pushed to, so gaining a mirror forces a push. */
    telegramPostCloneLinks: string[];
};

/**
 * Fingerprints what gets sent to Telegram, so an unchanged note can be skipped without asking
 * Telegram whether anything changed.
 *
 * Hashes the rendered output rather than the raw note, which is what makes the value safe to
 * store in the note's own frontmatter: frontmatter is stripped before rendering, so writing
 * the hash back cannot alter the thing the hash is taken over.
 *
 * The clone links are part of the fingerprint because adding a mirror has to force a push even
 * when the body is untouched — otherwise a note that never gets edited again would never
 * publish its new post. They are sorted so that merely reordering them does not force one.
 *
 * Image bytes are deliberately not read: replacing an image without editing the note leaves
 * the fingerprint unchanged, exactly as it already leaves the watcher unaware, since only
 * markdown files are watched.
 */
export function hashRenderedNote({
    markdown, media, telegramPostCloneLinks,
}: HashInput): string {
    const hash = createHash('sha256');

    // Fields are separated by a NUL, which cannot occur in any of them, so no combination of
    // values can be rearranged into the same digest.
    hash.update(markdown);
    for (const embed of media) {
        hash.update(`\u0000${embed.id}\u0000${embed.absolutePath}`);
    }

    for (const link of [...telegramPostCloneLinks].sort()) {
        hash.update(`\u0000${link}`);
    }

    return hash.digest('hex').slice(0, HASH_LENGTH);
}
