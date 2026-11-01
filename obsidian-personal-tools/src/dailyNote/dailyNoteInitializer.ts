import { initializeDailyNote } from './dailyNoteTemplate';

export interface DailyFile { path: string }
export interface DailyVault<F extends DailyFile> {
	read(file: F): Promise<string>;
	process(file: F, transform: (content: string) => string): Promise<string>;
}

/** Serialize events, rechecking changes delivered while a write was in flight. */
export function createDailyNoteInitializer<F extends DailyFile>(vault: DailyVault<F>) {
	const pending = new Map<F, { promise: Promise<void>; dirty: boolean }>();
	let active = true;
	return {
		dispose(): void { active = false; },
		initialize(file: F): Promise<void> {
			if (!active) return Promise.resolve();
			const current = pending.get(file);
			if (current) {
				current.dirty = true;
				return current.promise;
			}
			const job = { promise: Promise.resolve(), dirty: false };
			job.promise = Promise.resolve().then(async () => {
				do {
					job.dirty = false;
					if (!active) return;
					const content = await vault.read(file);
					if (!active) return;
					if (initializeDailyNote(file.path, content) !== content) {
						await vault.process(file, latest => active ? initializeDailyNote(file.path, latest) : latest);
					}
				} while (active && job.dirty);
			}).finally(() => { pending.delete(file); });
			pending.set(file, job);
			return job.promise;
		},
	};
}
