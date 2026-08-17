import { Editor, Notice } from 'obsidian';
import { getSelectionAsPlainText } from '../utils/editorSelection';

/**
 * Copies the current selection to the clipboard with wiki-links flattened to
 * plain text, so vault notes can be pasted somewhere public without leaking
 * `[[...]]` syntax.
 */
export async function copyTextToPublic(editor: Editor): Promise<void> {
	const text = getSelectionAsPlainText(editor);

	if (text === null) {
		return;
	}

	try {
		await navigator.clipboard.writeText(text);
	} catch (err) {
		console.error('[copyTextToPublic] Failed to write to clipboard:', err);
		new Notice('Failed to copy the text to the clipboard.');
		return;
	}

	new Notice('Copied text to public.');
}
