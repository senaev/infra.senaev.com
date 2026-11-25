import type { App, TFile } from 'obsidian';

/** Frontmatter booleans that switch the calendars on. Only YAML `true` does; `"true"`, `yes`, `1` do not. */
export const REMINDERS_CALENDAR_PROPERTY = 'reminders-calendar';
export const MENTIONS_CALENDAR_PROPERTY = 'mentions-calendar';

export type NoteCalendarKind = 'reminders' | 'mentions';

/** The calendars that `file` asks for in its frontmatter, in display order. */
export function getNoteCalendarKinds(app: App, file: TFile | null): NoteCalendarKind[] {
	if (!file) {
		return [];
	}

	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const kinds: NoteCalendarKind[] = [];

	if (frontmatter?.[REMINDERS_CALENDAR_PROPERTY] === true) {
		kinds.push('reminders');
	}

	if (frontmatter?.[MENTIONS_CALENDAR_PROPERTY] === true) {
		kinds.push('mentions');
	}

	return kinds;
}
