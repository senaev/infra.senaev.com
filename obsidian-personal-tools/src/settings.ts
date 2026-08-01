import { App, PluginSettingTab } from 'obsidian';
import SenaevPersonalTools from './main';

export interface SenaevPluginSettings {
	// Add settings here as features are added
}

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
		containerEl.createEl('h2', { text: 'Senaev Personal Tools' });
	}
}
