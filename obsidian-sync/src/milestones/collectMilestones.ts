import { addDays, type CalendarDay } from './calendarDay';
import type { MilestonesConfig, MilestoneType } from './milestonesConfig';
import { renderMilestoneTemplate } from './renderMilestoneTemplate';
import { ruleOccursOn } from './ruleOccursOn';

export interface VaultNote {
    /** Relative to the vault root. */
    path: string;
    /** File name without `.md`. */
    basename: string;
    frontmatter: Record<string, unknown>;
}

export type InvalidRuleHandler = (note: VaultNote, rule: string, error: unknown) => void;

function parseFrontmatterDate(value: unknown): CalendarDay | null {
    // A YAML parser with timestamp support gives midnight UTC for an unquoted date.
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

        return {
            year: Number(match[1]),
            month: Number(match[2]),
            date: Number(match[3]),
        };
    }

    return null;
}

function computeAge(startYear: number, requestedYear: number, minKnownYear: number): number | undefined {
    if (startYear >= minKnownYear && startYear <= requestedYear) {
        return requestedYear - startYear;
    }

    return undefined;
}

interface DayScan {
    config: MilestonesConfig;
    day: CalendarDay;
    onInvalidRule: InvalidRuleHandler;
}

function matchMilestone(
    note: VaultNote,
    type: MilestoneType,
    {
        config, day, onInvalidRule,
    }: DayScan
): { age: number | undefined } | null {
    const date = parseFrontmatterDate(note.frontmatter[type.property]);

    if (date && date.date === day.date && date.month === day.month) {
        return { age: computeAge(date.year, day.year, config.minKnownYear) };
    }

    const rule = type.ruleProperty === undefined ? undefined : note.frontmatter[type.ruleProperty];

    if (typeof rule !== 'string') {
        return null;
    }

    try {
        return ruleOccursOn(rule, day) ? { age: undefined } : null;
    } catch (error) {
        onInvalidRule(note, rule, error);

        return null;
    }
}

function collectDayMilestones(
    notes: readonly VaultNote[],
    scan: DayScan,
    resolveEmoji: (type: MilestoneType) => string
): string[] {
    const lines: string[] = [];

    for (const note of notes) {
        // Only the YAML boolean hides, so a typo shows the milestone instead of hiding it.
        if (note.frontmatter[scan.config.hiddenProperty] === true) {
            continue;
        }

        for (const type of scan.config.types) {
            const match = matchMilestone(note, type, scan);

            if (!match) {
                continue;
            }

            lines.push(renderMilestoneTemplate({
                template: type.template,
                fileName: note.basename,
                age: match.age,
                emoji: resolveEmoji(type),
            }));
        }
    }

    return lines;
}

/** Tomorrow's milestones first, then today's, like the plugin's daily note widget. */
export function collectMilestoneLines(
    notes: readonly VaultNote[],
    config: MilestonesConfig,
    today: CalendarDay,
    onInvalidRule: InvalidRuleHandler
): string[] {
    const tomorrowScan = {
        config,
        day: addDays(today, 1),
        onInvalidRule,
    };
    const todayScan = {
        config,
        day: today,
        onInvalidRule,
    };

    return [
        ...collectDayMilestones(notes, tomorrowScan, () => config.tomorrowEmoji),
        ...collectDayMilestones(notes, todayScan, (type) => type.emoji),
    ];
}
