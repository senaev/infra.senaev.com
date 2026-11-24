import { Editor, Notice } from 'obsidian';
import { stripWikiLinks } from './stripWikiLinks';

/**
 * Returns the current selection with wiki-link syntax removed, ready to be sent
 * outside the vault.
 *
 * Returns `null` when nothing is selected, after telling the user why nothing
 * happened.
 */
export function getSelectionAsPlainText(editor: Editor): string | null {
	const selection = editor.getSelection().trim();

	if (!selection) {
		new Notice('Select some text first.');
		return null;
	}

	return stripWikiLinks(selection);
}
