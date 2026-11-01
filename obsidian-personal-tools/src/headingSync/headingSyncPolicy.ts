/*
 * MIT License
 *
 * Copyright (c) 2021 David Mohl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// Folder paths match complete segments at any depth, including descendants.
export const IGNORED_FOLDERS = ['_prompts', 'public/senaev_speaks', '_templates', 'periodic'] as const;
export const IGNORED_FILES = ['_template.md', 'daily_note_draft.md'] as const;
// Preserve the old wildcard rules for stream and short-link filenames.
export const IGNORED_FILENAME_PARTS = ['_stream', 'short_links'] as const;

export function isIgnoredPath(path: string): boolean {
	const filename = path.slice(path.lastIndexOf('/') + 1);
	const folder = `/${path.slice(0, path.lastIndexOf('/') + 1)}`;
	return IGNORED_FOLDERS.some(ignored => folder.includes(`/${ignored}/`))
		|| IGNORED_FILES.some(ignored => filename === ignored)
		|| IGNORED_FILENAME_PARTS.some(part => filename.includes(part));
}

export const RENAME_DELAY_MS = 1000;

// Filename Heading Sync 1.12.0 stock sanitization, without optional settings.
// Hashes stay in the H1; Obsidian filenames cannot contain them.
export function filenameFromHeading(heading: string): string {
	return heading.replace(/[\\/:|#^[\]]/g, '').trim();
}

export function targetPath(path: string, heading: string): string | null {
	if (!path.endsWith('.md') || isIgnoredPath(path)) return null;
	const name = filenameFromHeading(heading);
	if (!name || name === '.' || name === '..') return null;
	const parent = path.slice(0, path.lastIndexOf('/') + 1);
	const target = `${parent}${name}.md`;
	return target === path ? null : target;
}
