import { Notice, TFile, normalizePath, type Plugin } from 'obsidian';
import { RENAME_DELAY_MS, targetPath } from './headingSyncPolicy';

/** One-way H1 → filename. Never writes note content or scans the vault. */
export function registerHeadingSync(plugin: Plugin): void {
	const { app } = plugin;
	const timers = new Map<TFile, number>();
	const jobs = new Map<TFile, Promise<void>>();
	let stopped = false;

	async function rename(file: TFile): Promise<void> {
		if (stopped || !file.parent || app.vault.getAbstractFileByPath(file.path) !== file) return;
		const cache = app.metadataCache.getFileCache(file);
		if (file.path.endsWith('.excalidraw.md') || cache?.frontmatter?.['excalidraw-plugin'] || cache?.frontmatter?.['kanban-plugin']) return;
		const heading = cache?.headings?.find(item => item.level === 1)?.heading;
		if (!heading) return;
		const path = targetPath(file.path, heading);
		if (!path) return;
		const target = normalizePath(path);
		if (target === file.path) return;
		const existing = app.vault.getAbstractFileByPath(target);
		if (existing && existing !== file) {
			new Notice(`Cannot sync heading: ${target} already exists.`);
			return;
		}
		await app.fileManager.renameFile(file, target);
	}

	function schedule(file: TFile): void {
		// Match upstream's scope: only a modified active Markdown note.
		if (stopped || file.extension !== 'md' || app.workspace.getActiveFile() !== file) return;
		const pending = timers.get(file);
		if (pending !== undefined) window.clearTimeout(pending);
		timers.set(file, window.setTimeout(() => {
			timers.delete(file);
			const job = (jobs.get(file) ?? Promise.resolve())
				.then(() => rename(file))
				.catch((error: unknown) => {
					console.error('H1 filename sync failed', file.path, error);
					if (!stopped) new Notice(`Could not sync heading for ${file.path}. See console.`);
				})
				.finally(() => { if (jobs.get(file) === job) jobs.delete(file); });
			jobs.set(file, job);
		}, RENAME_DELAY_MS));
	}

	plugin.app.workspace.onLayoutReady(() => {
		if (!stopped) plugin.registerEvent(app.metadataCache.on('changed', schedule));
	});
	plugin.register(() => {
		stopped = true;
		for (const timer of timers.values()) window.clearTimeout(timer);
		timers.clear();
	});
}
