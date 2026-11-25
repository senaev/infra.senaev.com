import type { App, TFile } from 'obsidian';
import {
	buildMentionCalendar,
	buildReminderCalendar,
} from 'senaev-utils/src/obsidianCalendar/noteCalendar';
import type { ReminderStatus } from 'senaev-utils/src/obsidianReminders/reminderLine';
import { getNoteCalendarKinds } from './calendarProperties';
import { renderCalendar } from './renderCalendar';
import { getDailyNoteReminders } from './tasksPluginAdapter';

const REMINDER_STYLES = {
	open: { emoji: '👉', label: 'To do' },
	cancelled: { emoji: '❌', label: 'Cancelled' },
	done: { emoji: '✅', label: 'Done' },
} satisfies Record<ReminderStatus, { emoji: string; label: string }>;

const MENTION_STYLES = {
	mention: { emoji: '📅', label: 'Mentions' },
};

/**
 * Renders the calendars that the frontmatter of `file` asks for (`reminders-calendar`,
 * `mentions-calendar`) into `containerEl`, which is cleared first.
 */
export function renderNoteCalendars(app: App, containerEl: HTMLElement, file: TFile): void {
	containerEl.empty();

	for (const kind of getNoteCalendarKinds(app, file)) {
		const sectionEl = containerEl.createDiv();

		if (kind === 'reminders') {
			const reminders = getDailyNoteReminders(app);

			if (reminders === null) {
				// The Tasks plugin is not ready yet; its cache-update event renders this again.
				sectionEl.createSpan({ cls: 'senaev-calendar-note', text: 'Waiting for the Tasks plugin…' });
				continue;
			}

			renderCalendar(app, sectionEl, buildReminderCalendar(reminders, file.basename), {
				title: `${file.basename}: reminders`,
				emptyText: 'No reminders',
				kindStyles: REMINDER_STYLES,
			});
		} else {
			renderCalendar(
				app,
				sectionEl,
				buildMentionCalendar(app.metadataCache.resolvedLinks, file.path),
				{
					title: `${file.basename}: mentions`,
					emptyText: 'No mentions',
					kindStyles: MENTION_STYLES,
				},
			);
		}
	}
}
