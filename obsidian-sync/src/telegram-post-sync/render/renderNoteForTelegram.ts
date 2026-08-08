import { readFrontmatterList } from "../readFrontmatterList";
import { cutHistorySection } from "./cutHistorySection";
import { ensureEmptyLineAfterTables } from "./ensureEmptyLineAfterTables";
import { markTitleAsProvisioned } from "./markTitleAsProvisioned";
import { prependAliases } from "./prependAliases";
import { replaceWikiLinksWithCode } from "./replaceWikiLinksWithCode";
import { resolveImageEmbeds, type ResolvedEmbed } from "./resolveImageEmbeds";
import { stripFrontmatter } from "./stripFrontmatter";

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
 * Step order matters in two places: embeds must be resolved before wikilinks, otherwise the
 * wikilink pass would match the `[[...]]` inside an `![[...]]` embed; and aliases are
 * prepended last so they sit above the marked title and are never themselves processed as
 * note content.
 */
export function renderNoteForTelegram(rawContent: string): RenderedNote {
    const { frontmatter, body } = stripFrontmatter(rawContent);
    const aliases = readFrontmatterList(frontmatter, "aliases");

    const withoutHistory = cutHistorySection(body);
    const { markdown: withImages, media } = resolveImageEmbeds(withoutHistory);
    const withLinks = replaceWikiLinksWithCode(withImages);
    const spaced = ensureEmptyLineAfterTables(withLinks);
    const marked = markTitleAsProvisioned(spaced.trim());

    return { markdown: prependAliases(marked, aliases), media };
}
