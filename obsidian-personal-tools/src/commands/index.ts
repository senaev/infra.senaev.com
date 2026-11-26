import { Plugin } from 'obsidian';
import { copyPublicLink } from './copyPublicLink';
import { copyTextToPublic } from './copyTextToPublic';
import { searchSelectionInGoogle } from './searchSelectionInGoogle';
import { translateSelection } from './translateSelection';
import { insertCurrentDateLink } from './insertCurrentDateLink';
import { openWorkAchievements } from './openWorkAchievements';

/** Registers all user-facing commands for the plugin. */
export function registerCommands(plugin: Plugin): void {
	plugin.addCommand({
		id: 'insert-current-date-link',
		name: 'Insert current date link',
		editorCallback: (editor) => insertCurrentDateLink(editor),
	});

	plugin.addCommand({
		id: 'copy-public-link',
		name: 'Copy public link',
		callback: () => void copyPublicLink(plugin.app),
	});

	plugin.addCommand({
		id: 'copy-text-to-public',
		name: 'Copy text to public',
		editorCallback: (editor) => void copyTextToPublic(editor),
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

	plugin.addCommand({
		id: 'open-work-achievements',
		name: 'Open work achievements',
		callback: () => void openWorkAchievements(plugin.app),
	});
}
