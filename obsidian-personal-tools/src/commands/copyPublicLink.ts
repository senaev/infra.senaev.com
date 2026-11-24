import { App, Notice, TFile } from 'obsidian';

/** Vault-root folder whose notes are published to the website. */
const PUBLIC_FOLDER_NAME = 'public';

/** Base URL published notes are served from, e.g. `${BASE}my-note`. */
const PUBLIC_LINK_BASE_URL = 'https://senaev.com/notes/';

/**
 * Copies a public link to the currently active file, e.g.
 * `https://senaev.com/notes/all_senaev_speaks_posts`.
 *
 * Only files inside the vault-root `public/` folder are published there;
 * for anything else this shows an error Notice instead of a link.
 */
export async function copyPublicLink(app: App): Promise<void> {
	const file = app.workspace.getActiveFile();

	if (!file) {
		new Notice('No active file to copy a link for.');
		return;
	}

	if (!isInPublicFolder(file)) {
		new Notice(`"${file.name}" is not in the public folder.`);
		return;
	}

	const link = buildPublicLink(file);

	try {
		await navigator.clipboard.writeText(link);
	} catch (err) {
		console.error('[copyPublicLink] Failed to write to clipboard:', err);
		new Notice('Failed to copy the public link to the clipboard.');
		return;
	}

	new Notice(`Copied public link: ${link}`);
}

/** Whether `file` lives inside the vault-root public folder. */
function isInPublicFolder(file: TFile): boolean {
	return file.path.split('/')[0] === PUBLIC_FOLDER_NAME;
}

/**
 * Builds the public URL for `file`, using its basename (filename without
 * extension or folder path) as the URL slug.
 *
 * Example: `public/senaev_speaks/all_senaev_speaks_posts.md`
 *       -> `https://senaev.com/notes/all_senaev_speaks_posts`
 */
function buildPublicLink(file: TFile): string {
	return `${PUBLIC_LINK_BASE_URL}${encodeURIComponent(file.basename)}`;
}
