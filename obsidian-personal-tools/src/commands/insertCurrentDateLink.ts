import { moment } from 'obsidian';
import type { Editor } from 'obsidian';

/** Inserts the same local-date wiki-link as the _today Templater template. */
export function insertCurrentDateLink(editor: Editor): void {
	editor.replaceSelection(`[[${moment().format('YYYY-MM-DD')}]]`);
}
