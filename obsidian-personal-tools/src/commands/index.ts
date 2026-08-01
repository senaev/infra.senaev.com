import { Plugin } from 'obsidian';
import { copyPublicLink } from './copyPublicLink';

/** Registers all user-facing commands for the plugin. */
export function registerCommands(plugin: Plugin): void {
	plugin.addCommand({
		id: 'copy-public-link',
		name: 'Copy public link',
		callback: () => void copyPublicLink(plugin.app),
	});
}
