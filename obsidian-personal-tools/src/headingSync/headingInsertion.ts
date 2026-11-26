import { stripFrontmatter } from 'senaev-utils/src/obsidianNotes/stripFrontmatter';

// A new note is still "Untitled" until it is named; an H1 from that name would later rename it back.
const UNTITLED_NAME = /^Untitled( \d+)?$/;

export function headingFromFilename(basename: string): string | null {
	const heading = basename.trim();
	return heading && !UNTITLED_NAME.test(heading) ? heading : null;
}

/**
 * Returns the content with `# heading` after the frontmatter (an empty body gets just the heading),
 * or null when the note starts with a block that stripFrontmatter cannot split (unterminated, CRLF).
 */
export function insertHeading(content: string, heading: string): string | null {
	const { body } = stripFrontmatter(content);
	if (body === content && content.startsWith('---')) return null;
	const frontmatter = content.slice(0, content.length - body.length);
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	if (!body.trim()) return `${frontmatter}${frontmatter && !/\n$/.test(frontmatter) ? eol : ''}# ${heading}${eol}`;
	const separator = /^[ \t]*\r?\n/.test(body) ? '' : eol;
	return `${frontmatter}# ${heading}${eol}${separator}${body}`;
}
