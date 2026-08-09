/**
 * Normalizes a single raw frontmatter value: trims it and strips one layer of surrounding
 * quotes.
 *
 * Shared by the reader and the writer on purpose. Write-back finds the item to replace by
 * comparing against the value the reader produced, so if the two disagreed about quoting,
 * write-back would silently fail to find a link it had just published a post for.
 */
export function unquoteFrontmatterItem(raw: string): string {
    return raw.trim().replace(/^["']|["']$/g, "").trim();
}
