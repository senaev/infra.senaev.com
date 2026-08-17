import { Plugin } from 'obsidian';
import { copyPublicLink } from './copyPublicLink';
import { copySelectionWithoutLinks } from './copySelectionWithoutLinks';
import { searchSelectionInGoogle } from './searchSelectionInGoogle';
import { translateSelection } from './translateSelection';

/** Registers all user-facing commands for the plugin. */
export function registerCommands(plugin: Plugin): void {
	plugin.addCommand({
		id: 'copy-public-link',
		name: 'Copy public link',
		callback: () => void copyPublicLink(plugin.app),
	});

	plugin.addCommand({
		id: 'copy-selection-without-links',
		name: 'Copy selection without links',
		editorCallback: (editor) => void copySelectionWithoutLinks(editor),
	});

	plugin.addCommand({
		id: 'search-selection-in-google',
		name: 'Search selection in Google',
		editorCallback: (editor) => searchSelectionInGoogle(editor),
	});

	plugin.addCommand({
		id: 'translate-selection-in-google-translate',
		name: 'Translate selection in Google Translate',
		editorCallback: (editor) => translateSelection(editor),
	});
}
