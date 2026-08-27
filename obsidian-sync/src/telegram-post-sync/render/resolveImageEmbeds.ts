import { basename, extname } from 'node:path';

import { TelegramRichMessageMedia } from 'senaev-utils/src/utils/TelegramApi/types';

import { findFileRecursively } from '../../public-files/findFileRecursively';
import { logger } from '../../logger';
import { OBSIDIAN_VAULT_PATH } from '../../env';

const EMBED = /!\[\[([^\]]+)\]\]/g;

// Only still images are supported. GIFs are excluded on purpose: Telegram treats them as
// animations, and declaring one as `type: "photo"` risks failing the whole edit, which
// would take the rest of the note down with it. A local broken marker is safer.
const PHOTO_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
]);

export type ResolveImageEmbedsResult = {
    markdown: string;
    media: TelegramRichMessageMedia[];
};

function brokenMarker(name: string): string {
    return `❌BROKEN_EMBED❌(${name})❌`;
}

/**
 * Rewrites Obsidian image embeds into Telegram rich-message media references.
 *
 *   ![[photo.png]]      ->  ![](tg://photo?id=img0)
 *   ![[photo.png|300]]  ->  ![](tg://photo?id=img0)   (display size is dropped)
 *
 * Files are located by filename anywhere in the vault, matching how Obsidian itself
 * resolves embeds. Anything that can't be resolved — a missing file, a note
 * transclusion, or an unsupported image type — is replaced with an inline broken marker
 * so the rest of the note still syncs.
 */
export function resolveImageEmbeds(body: string): ResolveImageEmbedsResult {
    const media: TelegramRichMessageMedia[] = [];
    const idByPath = new Map<string, string>();

    const markdown = body.replace(EMBED, (_match, rawTarget: string) => {
        // `|` separates the display size in Obsidian embeds, not an alias.
        const target = (rawTarget.split('|')[0] ?? '').trim();
        const fileName = basename(target);

        if (!fileName) {
            logger.warn({ rawTarget }, '⚠️ Empty image embed target');

            return brokenMarker(rawTarget);
        }

        if (!PHOTO_EXTENSIONS.has(extname(fileName).toLowerCase())) {
            logger.warn({ fileName }, '⚠️ Embed is not a supported image type');

            return brokenMarker(fileName);
        }

        const absolutePath = findFileRecursively(OBSIDIAN_VAULT_PATH, fileName);

        if (!absolutePath) {
            logger.warn({ fileName }, '⚠️ Embedded image not found in vault');

            return brokenMarker(fileName);
        }

        const existingId = idByPath.get(absolutePath);

        if (existingId !== undefined) {
            return `![](tg://photo?id=${existingId})`;
        }

        const id = `img${media.length}`;

        idByPath.set(absolutePath, id);
        media.push({
            id,
            absolutePath,
        });
        logger.info({
            fileName,
            id,
        }, '🖼 Resolved embedded image');

        return `![](tg://photo?id=${id})`;
    });

    return {
        markdown,
        media,
    };
}
