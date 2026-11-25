import type { App } from 'obsidian';
import { buildYearGrid } from 'senaev-utils/src/obsidianCalendar/calendarGrid';
import type { CalendarModel } from 'senaev-utils/src/obsidianCalendar/calendarModel';
import { DAILY_NOTE_FOLDER } from 'senaev-utils/src/obsidianDailyNotes/dailyNoteTemplate';
import { attachInternalLink } from '../dailyNote/internalLink';
import { formatDailyNoteBasename } from '../dailyNote/dailyNotePath';

export interface CalendarKindStyle {
	emoji: string;
	label: string;
}

export interface CalendarRenderOptions<Kind extends string> {
	/**
	 * Identifies the calendar across redraws and across the widgets that replace each other, so
	 * the scroll position of its years survives a refresh. E.g. the note path and the kind.
	 */
	scrollKey: string;
	title: string;
	/** Shown when the model has no entries at all. */
	emptyText: string;
	kindStyles: Readonly<Record<Kind, CalendarKindStyle>>;
}

/** `👉 3 ✅ 12`, kinds with nothing left out. */
function formatCounts<Kind extends string>(
	kinds: readonly Kind[],
	counts: Readonly<Record<Kind, number>>,
	styles: Readonly<Record<Kind, CalendarKindStyle>>,
): string {
	return kinds
		.filter((kind) => counts[kind] > 0)
		.map((kind) => `${styles[kind].emoji} ${counts[kind]}`)
		.join(' ');
}

/** Horizontal scroll of each year row, by calendar and year. A redraw builds new elements. */
const scrollPositions = new Map<string, number>();

function monthName(month: number): string {
	return new Date(2000, month - 1, 1).toLocaleString(undefined, { month: 'short' });
}

/**
 * Draws a GitHub-style calendar into `containerEl`: a title with the totals, then one row of
 * 12 months for each year, newest first. A day with entries links to its daily note.
 * The container is cleared first, so calling this again refreshes it.
 */
export function renderCalendar<Kind extends string>(
	app: App,
	containerEl: HTMLElement,
	model: CalendarModel<Kind>,
	options: CalendarRenderOptions<Kind>,
): void {
	containerEl.empty();
	containerEl.addClass('senaev-calendar');

	const header = containerEl.createDiv({ cls: 'senaev-calendar-header' });
	header.createSpan({ cls: 'senaev-calendar-title', text: options.title });
	header.createSpan({
		cls: 'senaev-calendar-totals',
		text: formatCounts(model.kinds, model.counts, options.kindStyles) || options.emptyText,
	});

	const today = formatDailyNoteBasename(new Date());

	for (const year of [...model.years].reverse()) {
		const yearEl = containerEl.createDiv({ cls: 'senaev-calendar-year' });
		const yearHeader = yearEl.createDiv({ cls: 'senaev-calendar-year-header' });
		yearHeader.createSpan({ cls: 'senaev-calendar-year-name', text: year.year });
		yearHeader.createSpan({
			cls: 'senaev-calendar-totals',
			text: formatCounts(model.kinds, year.counts, options.kindStyles),
		});

		const monthsEl = yearEl.createDiv({ cls: 'senaev-calendar-months' });
		const scrollPositionKey = `${options.scrollKey}|${year.year}`;
		monthsEl.addEventListener('scroll', () => scrollPositions.set(scrollPositionKey, monthsEl.scrollLeft));

		for (const { month, weeks } of buildYearGrid(Number(year.year))) {
			const monthEl = monthsEl.createDiv({ cls: 'senaev-calendar-month' });
			monthEl.createDiv({ cls: 'senaev-calendar-month-name', text: monthName(month) });
			const gridEl = monthEl.createDiv({ cls: 'senaev-calendar-grid' });

			for (const day of weeks.flat()) {
				if (day === null) {
					gridEl.createSpan({ cls: ['senaev-calendar-cell', 'is-outside'] });
					continue;
				}

				const dayData = year.days.get(day);
				const classes = ['senaev-calendar-cell'];

				if (day === today) {
					classes.push('is-today');
				}

				if (!dayData) {
					gridEl.createSpan({ cls: classes, attr: { 'aria-label': day } });
					continue;
				}

				classes.push(`is-${dayData.kind}`);
				// Obsidian shows `aria-label` as its hover tooltip, so it is both the tooltip and the accessible
				// name. `setTooltip` would do the same but needs Obsidian 1.4.4, and the plugin supports 1.4.0.
				const cell = gridEl.createEl('a', {
					cls: classes,
					attr: {
						'aria-label': `${day} ${formatCounts(model.kinds, dayData.counts, options.kindStyles)}`,
					},
				});
				attachInternalLink(app, cell, `${DAILY_NOTE_FOLDER}${day}`);
			}
		}

		// The element is not in the page yet (an editor widget attaches it later), so wait a frame.
		const savedScroll = scrollPositions.get(scrollPositionKey);

		if (savedScroll) {
			activeWindow.requestAnimationFrame(() => {
				monthsEl.scrollLeft = savedScroll;
			});
		}
	}
}
