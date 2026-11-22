import { Notice, TFile } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { createDailyNoteInitializer } from './dailyNoteInitializer';
import { hasReminder, type ReminderNote } from 'senaev-utils/src/obsidianDailyNotes/dailyReminders';
import { dailyDateFromPath, dailyNotePathForRootNote } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { DAILY_NOTE_FOLDER, getDailyNotePath } from './dailyNotePath';

async function ensureDailyFolder(app: App): Promise<void> {
	const segments = DAILY_NOTE_FOLDER.split('/').filter(Boolean);
	const folders = segments.map((_, index) => segments.slice(0, index + 1).join('/'));
	for (const folder of folders) {
		if (!app.vault.getAbstractFileByPath(folder)) {
			try { await app.vault.createFolder(folder); }
			catch (error) { if (!app.vault.getAbstractFileByPath(folder)) throw error; }
		}
	}
}

/** Only a blank note is moved, so a date-named note with content stays where its author put it. */
async function moveRootDailyNote(app: App, file: TFile): Promise<void> {
	const target = dailyNotePathForRootNote(file.path);
	if (!target || app.vault.getAbstractFileByPath(target)) return;
	if ((await app.vault.read(file)).trim() !== '') return;
	await ensureDailyFolder(app);
	if (app.vault.getAbstractFileByPath(target)) return;
	await app.fileManager.renameFile(file, target);
}

function readReminders(app: App): ReminderNote[] {
	const notes: ReminderNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.path.startsWith(DAILY_NOTE_FOLDER) || file.path.startsWith('plugins/') ||
			file.path.endsWith('.excalidraw.md') ||
			file.path.split('/').slice(0, -1).some(segment => segment.startsWith('.') || segment === 'node_modules')) {
			continue;
		}
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (frontmatter && hasReminder(frontmatter)) notes.push({ path: file.path, frontmatter });
	}
	return notes;
}

/** Handles all vault entry points rather than depending on one note-creation command. */
export function registerDailyNoteCreation(plugin: Plugin): void {
	const { app } = plugin;
	const initializer = createDailyNoteInitializer<TFile>({
		read: file => app.vault.read(file),
		process: (file, transform) => app.vault.process(file, transform),
	}, () => ({
		notes: readReminders(app),
		onInvalidSchedule: path => { console.warn('Invalid daily reminder schedule', path); },
	}));
	plugin.register(() => initializer.dispose());
	const initialize = (file: unknown): void => {
		if (!(file instanceof TFile) || !dailyDateFromPath(file.path)) return;
		void initializer.initialize(file).catch((error: unknown) => {
			console.error('Daily note initialization failed', error);
			new Notice('Could not initialize daily note. Reopen it to retry.');
		});
	};
	// Ignore the initial vault enumeration. Opening a blank note explicitly
	// still initializes it, including a note synced while the plugin was unloaded.
	const moveToDailyFolder = (file: unknown): void => {
		if (!(file instanceof TFile)) return;
		void moveRootDailyNote(app, file).catch((error: unknown) => {
			console.error(`Could not move daily note to ${DAILY_NOTE_FOLDER}`, error);
			new Notice(`Could not move daily note to ${DAILY_NOTE_FOLDER}. See console for details.`);
		});
	};
	plugin.app.workspace.onLayoutReady(() => {
		plugin.registerEvent(app.vault.on('create', moveToDailyFolder));
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
				const path = getDailyNotePath(new Date());
				await ensureDailyFolder(app);
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
