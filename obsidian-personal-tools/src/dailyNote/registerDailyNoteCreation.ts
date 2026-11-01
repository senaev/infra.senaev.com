import { Notice, TFile } from 'obsidian';
import type { Plugin } from 'obsidian';
import { createDailyNoteInitializer } from './dailyNoteInitializer';
import { dailyDateFromPath } from './dailyNoteTemplate';
import { formatDailyNoteBasename } from './dailyNotePath';

/** Handles all vault entry points rather than depending on one note-creation command. */
export function registerDailyNoteCreation(plugin: Plugin): void {
	const { app } = plugin;
	const initializer = createDailyNoteInitializer<TFile>({
		read: file => app.vault.read(file),
		process: (file, transform) => app.vault.process(file, transform),
	});
	plugin.register(() => initializer.dispose());
	const initialize = (file: unknown): void => {
		if (!(file instanceof TFile) || !dailyDateFromPath(file.path)) return;
		void initializer.initialize(file).catch((error: unknown) => {
			console.error('Daily note initialization failed', error);
			new Notice('Could not initialize daily note. Reopen it to retry.');
		});
	};
	// Ignore the initial vault enumeration. Opening a blank/marker note explicitly
	// still initializes it, including a note synced while the plugin was unloaded.
	plugin.app.workspace.onLayoutReady(() => {
		plugin.registerEvent(app.vault.on('create', initialize));
		plugin.registerEvent(app.vault.on('modify', initialize));
		plugin.registerEvent(app.vault.on('rename', initialize));
		plugin.registerEvent(app.workspace.on('file-open', initialize));
		initialize(app.workspace.getActiveFile());
	});
	plugin.addCommand({
		id: 'open-or-create-daily-note',
		name: 'Open or create today’s daily note',
		callback: () => {
			void (async () => {
				const path = `periodic/day/${formatDailyNoteBasename(new Date())}.md`;
				for (const folder of ['periodic', 'periodic/day']) {
					if (!app.vault.getAbstractFileByPath(folder)) {
						try { await app.vault.createFolder(folder); }
						catch (error) { if (!app.vault.getAbstractFileByPath(folder)) throw error; }
					}
				}
				let file = app.vault.getAbstractFileByPath(path);
				if (!file) {
					try { file = await app.vault.create(path, ''); }
					catch (error) {
						file = app.vault.getAbstractFileByPath(path);
						if (!file) throw error;
					}
				}
				if (!(file instanceof TFile)) throw new Error('Daily note path is not a file');
				await initializer.initialize(file);
				await app.workspace.getLeaf(false).openFile(file);
			})().catch((error: unknown) => {
				console.error('Could not open daily note', error);
				new Notice('Could not open daily note. See console for details.');
			});
		},
	});
}
