/**
 * Splits a leading `---` fenced frontmatter block off the note body.
 *
 * Returns an empty `frontmatter` when the note has none, so callers can treat both
 * shapes uniformly.
 */
export function stripFrontmatter(content: string): { frontmatter: string; body: string } {
    if (!content.startsWith('---\n')) {
        return {
            frontmatter: '',
            body: content,
        };
    }

    const closingIndex = content.indexOf('\n---', '---\n'.length - 1);

    if (closingIndex === -1) {
        // Unterminated fence — treat the whole file as body rather than losing it.
        return {
            frontmatter: '',
            body: content,
        };
    }

    const frontmatter = content.slice('---\n'.length, closingIndex);
    const afterClosing = content.slice(closingIndex + '\n---'.length);

    return {
        frontmatter,
        body: afterClosing.replace(/^[^\n]*\n?/, ''),
    };
}
