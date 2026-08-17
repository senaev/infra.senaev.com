import { Editor } from 'obsidian';
import { getSelectionAsPlainText } from '../utils/editorSelection';

/** Google search endpoint. */
const GOOGLE_SEARCH_URL = 'https://www.google.ru/search';

/** Opens a Google search for the current selection in the default browser. */
export function searchSelectionInGoogle(editor: Editor): void {
	const text = getSelectionAsPlainText(editor);

	if (text === null) {
		return;
	}

	const url = new URL(GOOGLE_SEARCH_URL);
	url.searchParams.set('q', text);

	activeWindow.open(url.toString());
}
