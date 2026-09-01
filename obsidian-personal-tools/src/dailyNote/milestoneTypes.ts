import milestoneTypes from '../milestone-types.json';

/** How one kind of milestone is worded and marked. */
export interface MilestoneType {
	/** Fills `{{EMOJI}}` when the milestone falls on the note's own date. */
	emoji: string;
	/** Message wording; see `renderMilestoneTemplate` for the placeholders. */
	template: string;
}

/**
 * Milestone types, keyed by the frontmatter property holding the date — the
 * `birthday` entry renders every note with a `birthday:` property, and adding a
 * type is a matter of adding an entry to `src/milestone-types.json`.
 */
export const MILESTONE_TYPES: Record<string, MilestoneType> = milestoneTypes;

/** Frontmatter property whose type also styles the computed Mother's Day. */
export const HOLIDAY_PROPERTY = 'holiday';

/** Fills `{{EMOJI}}` for a milestone that falls on the day after the note's. */
export const TOMORROW_EMOJI = '🔜';

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
