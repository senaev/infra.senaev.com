import milestonesConfig from './milestones.json';

/** How one kind of milestone is found in frontmatter, worded and marked. */
export interface MilestoneType {
	/** Frontmatter property holding a `YYYY-MM-DD` date. */
	property: string;
	/** Optional frontmatter property holding an RRULE; see `ruleOccursOn`. */
	ruleProperty?: string;
	/** Fills `{{EMOJI}}` when the milestone falls on the note's own date. */
	emoji: string;
	/** Message wording; see `renderMilestoneTemplate` for the placeholders. */
	template: string;
}

/**
 * Milestone types in display order, from `milestones.json` next to this file,
 * which external code reads too. Adding
 * a type is a matter of adding an entry there and rebuilding the plugin.
 */
export const MILESTONE_TYPES: readonly MilestoneType[] = milestonesConfig.types;

/** A note sets this property to `true` to hide all of its milestones. */
export const HIDDEN_PROPERTY = milestonesConfig.hiddenProperty;

/** Dates with an earlier year recur without a known start and have no age. */
export const MIN_KNOWN_YEAR = milestonesConfig.minKnownYear;

/** Fills `{{EMOJI}}` for a milestone that falls on the day after the note's. */
export const TOMORROW_EMOJI = milestonesConfig.tomorrowEmoji;

/**
 * Fills a milestone template. Placeholders:
 *
 * - `{{FILENAME}}` — note name without the extension, e.g. `@mom`.
 * - `{{AGE}}` — years since the date in parentheses, e.g. `(62)`. Empty when
 *   the year is a placeholder such as `0001-12-31`, which the vault uses for
 *   dates that recur without a known start.
 * - `{{EMOJI}}` — the type's emoji, or `🔜` when the milestone is tomorrow's.
 *
 * Whitespace runs are collapsed and the result trimmed afterwards, so an empty
 * placeholder leaves neither a double space nor a dangling gap, and templates
 * can be written with the spacing they read best with.
 */
export function renderMilestoneTemplate({
	template,
	fileName,
	age,
	emoji,
}: {
	template: string;
	fileName: string;
	age: number | undefined;
	emoji: string;
}): string {
	// Replacements are functions so that `$&` and friends inside a note name
	// are inserted literally instead of being read as substitution patterns.
	return template
		.replaceAll('{{FILENAME}}', () => fileName)
		.replaceAll('{{AGE}}', () => (age === undefined ? '' : `(${age})`))
		.replaceAll('{{EMOJI}}', () => emoji)
		.replace(/\s+/g, ' ')
		.trim();
}
