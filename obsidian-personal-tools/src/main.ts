import { registerHeadingSync } from './headingSync/registerHeadingSync';
import { Plugin } from 'obsidian';
import { registerDailyNoteCreation } from './dailyNote/registerDailyNoteCreation';
import {
	DEFAULT_SETTINGS,
	SenaevPluginSettings,
	SenaevSettingTab,
} from './settings';
import { registerCommands } from './commands';
import { registerDailyNoteWidgets } from './dailyNote/dailyNoteWidgetsManager';
import { registerRemindersGlobals } from './reminders/registerRemindersGlobals';

export default class SenaevPersonalTools extends Plugin {
	settings!: SenaevPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SenaevSettingTab(this.app, this));

		registerCommands(this);
		registerDailyNoteCreation(this);
		registerHeadingSync(this);
		registerDailyNoteWidgets(this);
		registerRemindersGlobals(this);
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
