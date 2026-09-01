import { App } from 'obsidian';
import {
	HOLIDAY_PROPERTY,
	MILESTONE_TYPES,
	MilestoneType,
	TOMORROW_EMOJI,
	renderMilestoneTemplate,
} from './milestoneTypes';

/** A single milestone (birthday, holiday, …) to show on a daily note. */
export interface DailyMilestone {
	/** Rendered display text, e.g. `@mom birthday (65) 🎉`. */
	text: string;
	/** Vault path (or linkpath) of the note to link to. */
	path: string;
}

/** Picks the emoji for a milestone, given the type it belongs to. */
type ResolveEmoji = (type: MilestoneType) => string;

interface CalendarDay {
	year: number;
	month: number;
	date: number;
}

interface FrontmatterDate {
	day: number;
	month: number;
	year: number;
}

/** Name of the note that documents the "last Sunday of November" holiday. */
const MOTHERS_DAY_LINKPATH = "Mother's Day";
const MOTHERS_DAY_FALLBACK_PATH = "Mother's Day.md";

/**
 * Parses a milestone frontmatter value into its day/month/year parts. Obsidian
 * may hand back either a `Date` (when the YAML value is auto-detected as a
 * timestamp) or a plain `YYYY-MM-DD` string, so both are supported.
 */
function parseFrontmatterDate(value: unknown): FrontmatterDate | null {
	if (value instanceof Date) {
		return {
			day: value.getUTCDate(),
			month: value.getUTCMonth() + 1,
			year: value.getUTCFullYear(),
		};
	}

	if (typeof value === 'string') {
		const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
		if (!match) {
			return null;
		}

		const [, year, month, day] = match;
		return { day: Number(day), month: Number(month), year: Number(year) };
	}

	return null;
}

/** Computes `age` for a milestone, or `undefined` if the year is a placeholder. */
function computeAge(birthYear: number, requestedYear: number): number | undefined {
	if (birthYear > 1900 && birthYear <= requestedYear) {
		return requestedYear - birthYear;
	}

	return undefined;
}

/** Whether `Mother's Day` (last Sunday of November) falls on `day`. */
function isMothersDay({ year, month, date }: CalendarDay): boolean {
	if (month !== 11) {
		return false;
	}

	const checkDate = new Date(year, month - 1, date);
	if (checkDate.getDay() !== 0) {
		return false;
	}

	const nextSunday = new Date(checkDate);
	nextSunday.setDate(nextSunday.getDate() + 7);

	// If the following Sunday is already in December, `checkDate` is the
	// last Sunday of November.
	return nextSunday.getMonth() === 11;
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
		if (!frontmatter) {
			continue;
		}

		for (const [property, type] of Object.entries(MILESTONE_TYPES)) {
			const date = parseFrontmatterDate(frontmatter[property]);
			if (!date || date.day !== day.date || date.month !== day.month) {
				continue;
			}

			milestones.push({
				text: renderMilestoneTemplate({
					template: type.template,
					fileName: file.basename,
					age: computeAge(date.year, day.year),
					emoji: resolveEmoji(type),
				}),
				path: file.path,
			});
		}
	}

	// Mother's Day is derived from the calendar rather than a frontmatter date,
	// so there is no note property to hang a type on; it borrows the wording of
	// `holiday`, and is skipped if that type is ever removed.
	const holidayType = MILESTONE_TYPES[HOLIDAY_PROPERTY];
	if (isMothersDay(day) && holidayType) {
		const mothersDayFile = app.metadataCache.getFirstLinkpathDest(MOTHERS_DAY_LINKPATH, '');
		milestones.push({
			text: renderMilestoneTemplate({
				template: holidayType.template,
				fileName: MOTHERS_DAY_LINKPATH,
				age: undefined,
				emoji: resolveEmoji(holidayType),
			}),
			path: mothersDayFile?.path ?? MOTHERS_DAY_FALLBACK_PATH,
		});
	}

	return milestones;
}

/**
 * Returns the milestones to display on the daily note for `noteDate`:
 * tomorrow's milestones (marked 🔜) followed by the note's own.
 */
export function getDailyNoteMilestones(app: App, noteDate: Date): DailyMilestone[] {
	const today: CalendarDay = {
		year: noteDate.getFullYear(),
		month: noteDate.getMonth() + 1,
		date: noteDate.getDate(),
	};

	const tomorrowDate = new Date(noteDate);
	tomorrowDate.setDate(tomorrowDate.getDate() + 1);
	const tomorrow: CalendarDay = {
		year: tomorrowDate.getFullYear(),
		month: tomorrowDate.getMonth() + 1,
		date: tomorrowDate.getDate(),
	};

	return [
		...collectAllMilestones(app, tomorrow, () => TOMORROW_EMOJI),
		...collectAllMilestones(app, today, (type) => type.emoji),
	];
}
