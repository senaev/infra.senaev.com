import { App, PluginSettingTab, Setting } from 'obsidian';
import SenaevPersonalTools from './main';

export type SenaevPluginSettings = Record<string, never>;

export const DEFAULT_SETTINGS: SenaevPluginSettings = {};

export class SenaevSettingTab extends PluginSettingTab {
	plugin: SenaevPersonalTools;

	constructor(app: App, plugin: SenaevPersonalTools) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName('Preferences').setHeading();
	}
}
