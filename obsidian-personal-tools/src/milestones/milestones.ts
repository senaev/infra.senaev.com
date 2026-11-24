import { App } from 'obsidian';
import { CalendarDay, toCalendarDay } from './calendarDay';
import { ruleOccursOn } from './milestoneRule';
import {
	HIDDEN_PROPERTY,
	MILESTONE_TYPES,
	MIN_KNOWN_YEAR,
	MilestoneType,
	TOMORROW_EMOJI,
	renderMilestoneTemplate,
} from './milestoneTypes';

/** A single milestone (birthday, holiday, …) to show on a daily note. */
export interface DailyMilestone {
	/** Rendered display text, e.g. `@mom birthday (65) 🥳`. */
	text: string;
	/** Vault path of the note to link to. */
	path: string;
}

/** Picks the emoji for a milestone, given the type it belongs to. */
type ResolveEmoji = (type: MilestoneType) => string;

type Frontmatter = Record<string, unknown>;

/** Whether a note opts out of milestones with `milestones-hidden: true`. */
function isMilestonesHidden(frontmatter: Frontmatter): boolean {
	return frontmatter[HIDDEN_PROPERTY] === true;
}

/**
 * Parses a milestone frontmatter value into a calendar day. Obsidian may hand
 * back either a `Date` (when the YAML value is auto-detected as a timestamp)
 * or a plain `YYYY-MM-DD` string, so both are supported.
 */
function parseFrontmatterDate(value: unknown): CalendarDay | null {
	if (value instanceof Date) {
		return {
			year: value.getUTCFullYear(),
			month: value.getUTCMonth() + 1,
			date: value.getUTCDate(),
		};
	}

	if (typeof value === 'string') {
		const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
		if (!match) {
			return null;
		}

		const [, year, month, date] = match;
		return { year: Number(year), month: Number(month), date: Number(date) };
	}

	return null;
}

/** Computes `age` for a milestone, or `undefined` if the year is a placeholder. */
function computeAge(startYear: number, requestedYear: number): number | undefined {
	if (startYear >= MIN_KNOWN_YEAR && startYear <= requestedYear) {
		return requestedYear - startYear;
	}

	return undefined;
}

/**
 * Whether the note's `type` milestone falls on `day`, and with which age. A
 * fixed date gives an age from its year; a calculated rule gives none.
 */
function matchMilestone(
	frontmatter: Frontmatter,
	type: MilestoneType,
	day: CalendarDay,
): { age: number | undefined } | null {
	const date = parseFrontmatterDate(frontmatter[type.property]);
	if (date && date.date === day.date && date.month === day.month) {
		return { age: computeAge(date.year, day.year) };
	}

	const rule = type.ruleProperty === undefined ? undefined : frontmatter[type.ruleProperty];
	if (typeof rule === 'string' && ruleOccursOn(rule, day)) {
		return { age: undefined };
	}

	return null;
}

/** Collects every milestone that falls on `day`, in configured type order. */
function collectAllMilestones(
	app: App,
	day: CalendarDay,
	resolveEmoji: ResolveEmoji,
): DailyMilestone[] {
	const milestones: DailyMilestone[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter || isMilestonesHidden(frontmatter)) {
			continue;
		}

		for (const type of MILESTONE_TYPES) {
			const match = matchMilestone(frontmatter, type, day);
			if (!match) {
				continue;
			}

			milestones.push({
				text: renderMilestoneTemplate({
					template: type.template,
					fileName: file.basename,
					age: match.age,
					emoji: resolveEmoji(type),
				}),
				path: file.path,
			});
		}
	}

	return milestones;
}

/**
 * Returns the milestones to display on the daily note for `noteDate`:
 * tomorrow's milestones (marked 🔜) followed by the note's own.
 */
export function getDailyNoteMilestones(app: App, noteDate: Date): DailyMilestone[] {
	const tomorrowDate = new Date(noteDate);
	tomorrowDate.setDate(tomorrowDate.getDate() + 1);

	return [
		...collectAllMilestones(app, toCalendarDay(tomorrowDate), () => TOMORROW_EMOJI),
		...collectAllMilestones(app, toCalendarDay(noteDate), (type) => type.emoji),
	];
}
