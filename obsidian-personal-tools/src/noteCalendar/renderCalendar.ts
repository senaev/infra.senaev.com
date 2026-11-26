import { setIcon, type App } from 'obsidian';
import { buildYearGrid } from 'senaev-utils/src/obsidianCalendar/calendarGrid';
import type { CalendarModel, CalendarYear } from 'senaev-utils/src/obsidianCalendar/calendarModel';
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
	 * the chosen year and the scroll position of its months survive a refresh.
	 * E.g. the note path and the kind.
	 */
	scrollKey: string;
	title: string;
	/** Shown when there is nothing to count. */
	emptyText: string;
	kindStyles: Readonly<Record<Kind, CalendarKindStyle>>;
}

/** Marks the header buttons, so that the focused one can be found again after a redraw. */
const CONTROL_ATTRIBUTE = 'data-senaev-control';

/** The year each calendar shows when compact. A redraw builds new elements, so it is kept here. */
const selectedYears = new Map<string, string>();

/** The calendars opened with the `⋯` button: every year, with the statistics. */
const expandedCalendars = new Set<string>();

/** Horizontal scroll of each year's months, by calendar and year. */
const scrollPositions = new Map<string, number>();

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

function monthName(month: number): string {
	return new Date(2000, month - 1, 1).toLocaleString(undefined, { month: 'short' });
}

/** Short name of the weekday in row `row` of a Monday-first week. 2024-01-01 is a Monday. */
function weekdayName(row: number): string {
	return new Date(2024, 0, 1 + row).toLocaleString(undefined, { weekday: 'short' });
}

/** The saved year if it still exists, else the newest one. */
function pickYear<Kind extends string>(model: CalendarModel<Kind>, key: string): string | undefined {
	const saved = selectedYears.get(key);
	const years = model.years.map((year) => year.year);

	return saved !== undefined && years.includes(saved) ? saved : years[years.length - 1];
}

function createNavButton(
	parentEl: HTMLElement,
	control: string,
	icon: string,
	label: string,
	onClick: (() => void) | null,
): void {
	const button = parentEl.createEl('button', {
		cls: ['clickable-icon', 'senaev-calendar-nav'],
		attr: { 'aria-label': label, [CONTROL_ATTRIBUTE]: control },
	});
	setIcon(button, icon);

	if (onClick) {
		button.addEventListener('click', onClick);
	} else {
		button.disabled = true;
	}
}

/**
 * Draws a GitHub-style calendar into `containerEl`. Compact, it is a year switcher and the months
 * of one year, with nothing else. The `⋯` button opens every year, newest first, with the
 * title, the totals and the weekday names. A day with entries links to its daily note.
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

	const expanded = expandedCalendars.has(options.scrollKey);
	const selectedYear = pickYear(model, options.scrollKey);
	const redraw = () => {
		// A redraw replaces every element, which would drop the focus of a keyboard user.
		const focused = activeDocument.activeElement;
		const focusedControl = containerEl.contains(focused) ? (focused?.getAttribute(CONTROL_ATTRIBUTE) ?? null) : null;

		renderCalendar(app, containerEl, model, options);

		if (focusedControl !== null) {
			// The arrow that was pressed is disabled at the first or last year; the `⋯` button is always there.
			const target = containerEl.querySelector<HTMLElement>(`[${CONTROL_ATTRIBUTE}="${focusedControl}"]:not([disabled])`)
				?? containerEl.querySelector<HTMLElement>(`[${CONTROL_ATTRIBUTE}="more"]`);
			target?.focus();
		}
	};

	renderHeader(containerEl, model, options, expanded, selectedYear, {
		selectYear: (year) => {
			selectedYears.set(options.scrollKey, year);
			redraw();
		},
		toggleExpanded: () => {
			if (!expanded) {
				expandedCalendars.add(options.scrollKey);
			} else {
				expandedCalendars.delete(options.scrollKey);
			}
			redraw();
		},
	});

	const today = formatDailyNoteBasename(new Date());
	const shownYears = expanded
		? [...model.years].reverse()
		: model.years.filter((year) => year.year === selectedYear);

	for (const year of shownYears) {
		renderYear(app, containerEl, model, options, year, expanded, today);
	}
}

function renderHeader<Kind extends string>(
	containerEl: HTMLElement,
	model: CalendarModel<Kind>,
	options: CalendarRenderOptions<Kind>,
	expanded: boolean,
	selectedYear: string | undefined,
	actions: { selectYear(year: string): void; toggleExpanded(): void },
): void {
	const headerEl = containerEl.createDiv({
		cls: expanded ? ['senaev-calendar-header', 'is-expanded'] : ['senaev-calendar-header'],
	});
	const switcherEl = headerEl.createDiv({ cls: 'senaev-calendar-switcher' });

	if (model.years.length === 0) {
		switcherEl.createSpan({ cls: 'senaev-calendar-totals', text: options.emptyText });
		return;
	}

	if (!expanded) {
		const index = model.years.findIndex((year) => year.year === selectedYear);
		const older = model.years[index - 1];
		const newer = model.years[index + 1];

		createNavButton(switcherEl, 'previous', 'chevron-left', 'Previous year', older ? () => actions.selectYear(older.year) : null);
		switcherEl.createSpan({ cls: 'senaev-calendar-year-label', text: selectedYear });
		createNavButton(switcherEl, 'next', 'chevron-right', 'Next year', newer ? () => actions.selectYear(newer.year) : null);
	}

	// Expanded, the heading goes between the switcher (empty then) and the button, which keeps it in the middle.
	if (expanded) {
		const headingEl = headerEl.createDiv({ cls: 'senaev-calendar-heading' });
		headingEl.createDiv({ cls: 'senaev-calendar-title', text: options.title });
		headingEl.createDiv({
			cls: 'senaev-calendar-totals',
			text: formatCounts(model.kinds, model.counts, options.kindStyles) || options.emptyText,
		});
	}

	// The button is at the right end of the header, away from the year switcher.
	const moreButton = headerEl.createDiv({ cls: 'senaev-calendar-header-end' }).createEl('button', {
		cls: expanded ? ['clickable-icon', 'senaev-calendar-more', 'is-active'] : ['clickable-icon', 'senaev-calendar-more'],
		text: '⋯',
		attr: {
			'aria-label': expanded ? 'Show one year' : 'Show all years and statistics',
			[CONTROL_ATTRIBUTE]: 'more',
		},
	});
	moreButton.addEventListener('click', () => actions.toggleExpanded());
}

function renderYear<Kind extends string>(
	app: App,
	containerEl: HTMLElement,
	model: CalendarModel<Kind>,
	options: CalendarRenderOptions<Kind>,
	year: CalendarYear<Kind>,
	showDetails: boolean,
	today: string,
): void {
	const yearEl = containerEl.createDiv({ cls: 'senaev-calendar-year' });

	if (showDetails) {
		const yearHeader = yearEl.createDiv({ cls: 'senaev-calendar-year-header' });
		yearHeader.createSpan({ cls: 'senaev-calendar-year-name', text: year.year });
		yearHeader.createSpan({
			cls: 'senaev-calendar-totals',
			text: formatCounts(model.kinds, year.counts, options.kindStyles),
		});
	}

	const bodyEl = yearEl.createDiv({ cls: 'senaev-calendar-body' });

	if (showDetails) {
		// The weekday names stay put while the months scroll. Monday is the first row; every other
		// row is named, so the labels are not crowded.
		const weekdaysEl = bodyEl.createDiv({ cls: 'senaev-calendar-weekdays' });
		weekdaysEl.createDiv({ cls: 'senaev-calendar-month-name', text: ' ' });
		const weekdayRowsEl = weekdaysEl.createDiv({ cls: 'senaev-calendar-weekday-rows' });

		for (let row = 0; row < 7; row++) {
			weekdayRowsEl.createSpan({ cls: 'senaev-calendar-weekday', text: row % 2 === 1 ? weekdayName(row) : '' });
		}
	}

	const monthsEl = bodyEl.createDiv({ cls: 'senaev-calendar-months' });
	const scrollPositionKey = `${options.scrollKey}|${year.year}`;
	monthsEl.addEventListener('scroll', () => scrollPositions.set(scrollPositionKey, monthsEl.scrollLeft));

	for (const { month, weeks, separated } of buildYearGrid(Number(year.year))) {
		// A month that follows one ending on the last row of its week is moved one column away.
		const monthEl = monthsEl.createDiv({
			cls: separated ? ['senaev-calendar-month', 'is-separated'] : ['senaev-calendar-month'],
		});
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
