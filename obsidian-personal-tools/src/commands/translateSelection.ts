import { Editor } from 'obsidian';
import { getSelectionAsPlainText } from '../utils/editorSelection';

/** Google Translate endpoint, already in translate mode. */
const GOOGLE_TRANSLATE_URL = 'https://translate.google.com/?op=translate';

/** Any Cyrillic letter, used to guess whether the selection is Russian. */
const CYRILLIC_PATTERN = /[а-яА-ЯЁё]/;

/** Google Translate code for "work out the language yourself". */
const AUTO_LANGUAGE = 'auto';

/** Google Translate code for Russian. */
const RUSSIAN_LANGUAGE = 'ru';

/**
 * Opens Google Translate for the current selection, translating away from
 * Russian when the text is Cyrillic and into Russian otherwise.
 */
export function translateSelection(editor: Editor): void {
	const text = getSelectionAsPlainText(editor);

	if (text === null) {
		return;
	}

	const isRussian = CYRILLIC_PATTERN.test(text);

	const url = new URL(GOOGLE_TRANSLATE_URL);
	url.searchParams.set('text', text);
	url.searchParams.set('sl', isRussian ? RUSSIAN_LANGUAGE : AUTO_LANGUAGE);
	url.searchParams.set('tl', isRussian ? AUTO_LANGUAGE : RUSSIAN_LANGUAGE);

	activeWindow.open(url.toString());
}
