import { registerHeadingSync } from './headingSync/registerHeadingSync';
import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	SenaevPluginSettings,
	SenaevSettingTab,
} from './settings';
import { registerCommands } from './commands';
import { registerDailyNoteWidgets } from './dailyNote/dailyNoteWidgetsManager';
import { registerTasksGlobals } from './tasks/registerTasksGlobals';

export default class SenaevPersonalTools extends Plugin {
	settings!: SenaevPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SenaevSettingTab(this.app, this));

		registerCommands(this);
		registerHeadingSync(this);
		registerDailyNoteWidgets(this);
		registerTasksGlobals(this);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SenaevPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
