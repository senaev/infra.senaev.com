import { App } from 'obsidian';
import { getDailyHeaderNav } from './dailyHeaderNav';
import { attachInternalLink } from './internalLink';

const NBSP = '\u00A0';

/**
 * Renders the previous/current/next-day navigation row for `noteDate` into
 * `containerEl`: `⬅️ Weekday ➡️` (or `👈` if yesterday has an unchecked
 * reminder, `⏺️` if tomorrow's note doesn't exist yet). Clicking the weekday
 * name always jumps to today's actual daily note.
 *
 * `containerEl` is cleared and repopulated on every call, so it's safe to
 * call this repeatedly to refresh an already-mounted widget.
 */
export function renderDailyHeaderWidget(app: App, containerEl: HTMLElement, noteDate: Date): void {
	containerEl.empty();

	const nav = getDailyHeaderNav(app, noteDate);

	if (nav.yesterday) {
		const link = containerEl.createEl('a', {
			cls: 'internal-link',
			text: nav.yesterday.hasUndoneReminder ? '👈' : '⬅️',
		});
		attachInternalLink(app, link, nav.yesterday.path);
		containerEl.createSpan({ text: NBSP });
	}

	const todayLink = containerEl.createEl('a', { cls: 'internal-link', text: nav.weekdayName });
	attachInternalLink(app, todayLink, nav.todayPath);

	containerEl.createSpan({ text: NBSP });

	const tomorrowLink = containerEl.createEl('a', {
		cls: 'internal-link',
		text: nav.tomorrow.exists ? '➡️' : '⏺️',
	});
	attachInternalLink(app, tomorrowLink, nav.tomorrow.path);
}
