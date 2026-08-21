import { readFrontmatterList } from '../readFrontmatterList';

import { appendAliasesToTitle } from './appendAliasesToTitle';
import { cutHistorySection } from './cutHistorySection';
import { ensureEmptyLineAfterTables } from './ensureEmptyLineAfterTables';
import { markTitleAsProvisioned } from './markTitleAsProvisioned';
import { replaceWikiLinksWithCode } from './replaceWikiLinksWithCode';
import { resolveImageEmbeds, type ResolvedEmbed } from './resolveImageEmbeds';
import { stripFrontmatter } from './stripFrontmatter';

export type RenderedNote = {
    markdown: string;
    media: ResolvedEmbed[];
};

/**
 * Turns raw note content into the `markdown` + `media` pair that Telegram's
 * `InputRichMessage` expects.
 *
 * Telegram's rich markdown is GFM-compatible, so this is mostly a stripper rather than a
 * translator — headings, lists, task items, quotes, code fences and tables all pass
 * through untouched.
 *
 * Step order matters in three places: embeds must be resolved before wikilinks, otherwise
 * the wikilink pass would match the `[[...]]` inside an `![[...]]` embed; the title must be
 * marked before aliases are inserted, so the marker lands on the real title rather than on
 * the first alias; and aliases go in last so they are never themselves processed as note
 * content.
 */
export function renderNoteForTelegram(rawContent: string): RenderedNote {
    const { frontmatter, body } = stripFrontmatter(rawContent);
    const aliases = readFrontmatterList(frontmatter, 'aliases');

    const withoutHistory = cutHistorySection(body);
    const { markdown: withImages, media } = resolveImageEmbeds(withoutHistory);
    const withLinks = replaceWikiLinksWithCode(withImages);
    const spaced = ensureEmptyLineAfterTables(withLinks);
    const marked = markTitleAsProvisioned(spaced.trim());

    return {
        markdown: appendAliasesToTitle(marked, aliases),
        media,
    };
}
