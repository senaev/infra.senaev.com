import {
	App, PluginSettingTab, Setting, type SettingDefinitionItem,
} from 'obsidian';
import SenaevPersonalTools from './main';

export type SenaevPluginSettings = Record<string, never>;

export const DEFAULT_SETTINGS: SenaevPluginSettings = {};

export class SenaevSettingTab extends PluginSettingTab {
	plugin: SenaevPersonalTools;

	constructor(app: App, plugin: SenaevPersonalTools) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** The plugin has no settings yet, so settings search has nothing to index. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [];
	}

	/** Obsidian before 1.13 renders the tab only through display(). */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName('Preferences').setHeading();
	}
}
