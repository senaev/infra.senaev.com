import { Editor, Notice } from 'obsidian';
import { getSelectionAsPlainText } from '../utils/editorSelection';

/**
 * Copies the current selection to the clipboard with wiki-links flattened to
 * plain text, so vault notes can be pasted somewhere public without leaking
 * `[[...]]` syntax.
 */
export async function copySelectionWithoutLinks(editor: Editor): Promise<void> {
	const text = getSelectionAsPlainText(editor);

	if (text === null) {
		return;
	}

	try {
		await navigator.clipboard.writeText(text);
	} catch (err) {
		console.error('[copySelectionWithoutLinks] Failed to write to clipboard:', err);
		new Notice('Failed to copy the selection to the clipboard.');
		return;
	}

	new Notice('Copied selection without links.');
}
