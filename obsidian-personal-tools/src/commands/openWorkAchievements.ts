import { App, Notice } from 'obsidian';

/** Link text of the note, resolved like a `[[Work achievements]]` wiki-link. */
const WORK_ACHIEVEMENTS_LINKPATH = 'Work achievements';

/** Opens the "Work achievements" note, wherever it lives in the vault. */
export async function openWorkAchievements(app: App): Promise<void> {
	const file = app.metadataCache.getFirstLinkpathDest(WORK_ACHIEVEMENTS_LINKPATH, '');

	if (!file) {
		new Notice(`Note "${WORK_ACHIEVEMENTS_LINKPATH}" not found.`);
		return;
	}

	await app.workspace.getLeaf(false).openFile(file);
}
