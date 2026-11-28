import { stripFrontmatter } from 'senaev-utils/src/obsidianNotes/stripFrontmatter';
import { TelegramRichMessageMedia } from 'senaev-utils/src/utils/TelegramApi/types';
import { replaceWikiLinksWithHighlights } from 'senaev-utils/src/obsidianMarkdown/replaceWikiLinksWithHighlights';

import { readFrontmatterList } from '../readFrontmatterList';

import { appendAliasesToTitle } from './appendAliasesToTitle';
import { cutHistorySection } from './cutHistorySection';
import { ensureEmptyLineAfterTables } from './ensureEmptyLineAfterTables';
import { markTitleAsProvisioned } from './markTitleAsProvisioned';
import { preserveParagraphLineBreaks } from './preserveParagraphLineBreaks';
import { resolveImageEmbeds } from './resolveImageEmbeds';

export type RenderedNote = {
    markdown: string;
    media: TelegramRichMessageMedia[];
};

/**
 * Turns raw note content into the `markdown` + `media` pair that Telegram's
 * `InputRichMessage` expects.
 *
 * Telegram uses Rich Markdown. Explicit paragraph line breaks preserve the line layout
 * of the Obsidian note.
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
    const withLinks = replaceWikiLinksWithHighlights(withImages);
    const spaced = ensureEmptyLineAfterTables(withLinks);
    const withLineBreaks = preserveParagraphLineBreaks(spaced.trim());
    const marked = markTitleAsProvisioned(withLineBreaks);

    return {
        markdown: appendAliasesToTitle(marked, aliases),
        media,
    };
}
