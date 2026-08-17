/** Matches a whole `[[...]]` wiki-link, capturing everything between the brackets. */
const WIKI_LINK_PATTERN = /\[\[([^\]]*)\]\]/g;

/** Separates a link target from its display alias: `[[target|alias]]`. */
const ALIAS_SEPARATOR = '|';

/** Separates a link target from a heading anchor: `[[target#heading]]`. */
const ANCHOR_SEPARATOR = '#';

/**
 * Replaces every wiki-link in `text` with the plain text a reader should see:
 *
 * - `[[Note]]`             -> `Note`
 * - `[[Note|Alias]]`       -> `Alias`
 * - `[[Note#Heading]]`     -> `Note`
 * - `[[Note#Heading|Ali]]` -> `Ali`
 *
 * Use this whenever a selection leaves the vault — clipboard, search engine,
 * translator — because `[[...]]` syntax is meaningless outside Obsidian.
 */
export function stripWikiLinks(text: string): string {
	return text.replace(WIKI_LINK_PATTERN, (_wholeLink, inner: string) => {
		const [target = '', ...aliasParts] = inner.split(ALIAS_SEPARATOR);

		// An alias is what the author chose to show, so it wins over the target.
		// Any further separators belong to the alias itself and are kept.
		if (aliasParts.length > 0) {
			return aliasParts.join(ALIAS_SEPARATOR);
		}

		// No alias: drop the heading anchor, which is a location and not prose.
		return target.split(ANCHOR_SEPARATOR)[0] ?? '';
	});
}
