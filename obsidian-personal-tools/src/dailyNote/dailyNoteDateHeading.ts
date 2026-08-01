import { formatDailyNoteBasename } from './dailyNotePath';

/** Renders the `YYYY-MM-DD` date heading shown at the very top of a daily note. */
export function renderDailyNoteDateHeading(containerEl: HTMLElement, noteDate: Date): void {
	containerEl.createEl('h1', {
		text: formatDailyNoteBasename(noteDate),
		cls: 'senaev-daily-note-date-heading',
	});
}
