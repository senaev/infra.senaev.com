import { setIcon, type App } from 'obsidian';
import { buildYearGrid, widestGrid } from 'senaev-utils/src/obsidianCalendar/calendarGrid';
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

/** The saved year if it still exists, else the newest one. */
function pickYear<Kind extends string>(model: CalendarModel<Kind>, key: string): string | undefined {
	const saved = selectedYears.get(key);
	const years = model.years.map((year) => year.year);

	return saved !== undefined && years.includes(saved) ? saved : years[years.length - 1];
}

/**
 * Gives the box the width of the widest year, in compact and in expanded view alike, so that the
 * header, and with it the `⋯` button, stays where it is when the calendar expands. The CSS turns
 * the two numbers into a width: `columns` cells and the gaps between them.
 */
function sizeBox<Kind extends string>(boxEl: HTMLElement, model: CalendarModel<Kind>): void {
	const widest = widestGrid(model.years.map((year) => buildYearGrid(Number(year.year))));

	if (widest !== null) {
		boxEl.style.setProperty('--senaev-calendar-columns', String(widest.columns));
		boxEl.style.setProperty('--senaev-calendar-cell-gaps', String(widest.cellGaps));
	}
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
 * title and the totals. The header row stays as it is: only the year switcher goes. A day with
 * entries links to its daily note.
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

	// The header and the years share one box, as wide as the widest year and centred, so the year
	// switcher and the `⋯` button sit above the left and right corners of the grid, not of the note.
	const boxEl = containerEl.createDiv({ cls: 'senaev-calendar-box' });
	sizeBox(boxEl, model);

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

	renderHeader(boxEl, model, options, expanded, selectedYear, {
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
		renderYear(app, boxEl, model, options, year, expanded, today);
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
	// The same row in both views: the year switcher on the left, `⋯` on the right. Expanded, the switcher
	// is not drawn but its place stays, so the `⋯` button does not move.
	const headerEl = containerEl.createDiv({ cls: 'senaev-calendar-header' });
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

	const moreButton = headerEl.createDiv({ cls: 'senaev-calendar-header-end' }).createEl('button', {
		cls: expanded ? ['clickable-icon', 'senaev-calendar-more', 'is-active'] : ['clickable-icon', 'senaev-calendar-more'],
		text: '⋯',
		attr: {
			'aria-label': expanded ? 'Show one year' : 'Show all years and statistics',
			[CONTROL_ATTRIBUTE]: 'more',
		},
	});
	moreButton.addEventListener('click', () => actions.toggleExpanded());

	// Everything else goes below the header row.
	if (expanded) {
		const headingEl = containerEl.createDiv({ cls: 'senaev-calendar-heading' });
		headingEl.createDiv({ cls: 'senaev-calendar-title', text: options.title });
		headingEl.createDiv({
			cls: 'senaev-calendar-totals',
			text: formatCounts(model.kinds, model.counts, options.kindStyles) || options.emptyText,
		});
	}
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
