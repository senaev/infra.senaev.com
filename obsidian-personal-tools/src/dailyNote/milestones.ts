import { App } from 'obsidian';

/** A single milestone (birthday/holiday) to show on a daily note. */
export interface DailyMilestone {
	/** Display text, e.g. `@mom birthday (65)`. */
	title: string;
	/** Vault path (or linkpath) of the note to link to. */
	fileName: string;
	/** Emoji shown after the title (🔜 for tomorrow, 🎉 for today). */
	emoji: string;
}

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
 * Parses a `birthday`/`holiday` frontmatter value into its day/month/year
 * parts. Obsidian may hand back either a `Date` (when the YAML value is
 * auto-detected as a timestamp) or a plain `YYYY-MM-DD` string, so both are
 * supported.
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

/** Collects all birthdays/holidays (without emoji) that fall on `day`. */
function collectAllMilestones(app: App, day: CalendarDay): Omit<DailyMilestone, 'emoji'>[] {
	const milestones: Omit<DailyMilestone, 'emoji'>[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) {
			continue;
		}

		const birthday = parseFrontmatterDate(frontmatter.birthday);
		if (birthday && birthday.day === day.date && birthday.month === day.month) {
			const age = computeAge(birthday.year, day.year);
			milestones.push({
				title: `${file.basename} birthday${age !== undefined ? ` (${age})` : ''}`,
				fileName: file.path,
			});
		}

		const holiday = parseFrontmatterDate(frontmatter.holiday);
		if (holiday && holiday.day === day.date && holiday.month === day.month) {
			const age = computeAge(holiday.year, day.year);
			milestones.push({
				title: `${file.basename}${age !== undefined ? ` (${age})` : ''}`,
				fileName: file.path,
			});
		}
	}

	if (isMothersDay(day)) {
		const mothersDayFile = app.metadataCache.getFirstLinkpathDest(MOTHERS_DAY_LINKPATH, '');
		milestones.push({
			title: "Mother's Day",
			fileName: mothersDayFile?.path ?? MOTHERS_DAY_FALLBACK_PATH,
		});
	}

	return milestones;
}

/**
 * Returns the milestones to display on the daily note for `noteDate`:
 * tomorrow's milestones (🔜) followed by today's (🎉).
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
		...collectAllMilestones(app, tomorrow).map((milestone) => ({ ...milestone, emoji: '🔜' })),
		...collectAllMilestones(app, today).map((milestone) => ({ ...milestone, emoji: '🎉' })),
	];
}
