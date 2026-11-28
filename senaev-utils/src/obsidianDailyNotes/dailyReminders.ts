import { isoDayToUtcDate } from '../obsidianReminders/isoDay';

import { ruleOccursOn } from './ruleOccursOn';

export type ReminderNote = {
    path: string;
    frontmatter: Readonly<Record<string, unknown>>;
};

export type ReminderSource = {
    notes: readonly ReminderNote[];
    /** Vault Markdown paths, including notes that do not supply reminders. */
    notePaths?: readonly string[];
    /** Called when a reminder is skipped because one of its properties is invalid. */
    onInvalidReminder?: (path: string, property: string) => void;
};

type Section = 'morning' | 'day' | 'evening';

export function hasReminder(frontmatter: ReminderNote['frontmatter']): boolean {
    return ([
        'morning',
        'day',
        'evening',
    ] as const).some((section) => typeof frontmatter[`${section}-reminder`] === 'string');
}

const MACRO = /\{\{([^{}]*)\}\}/gu;

/**
 * Expands the macros of a reminder heading template, e.g. `{{day}}` to `2026-11-25`.
 * Returns undefined when the template has an unknown macro or the result is not a valid heading link.
 */
export function expandReminderHeading(template: string, day: string): string | undefined {
    const macros: Readonly<Record<string, string>> = { day };
    let valid = true;
    const heading = template.replace(MACRO, (_, name: string) => {
        const value = macros[name.trim()];

        if (value === undefined) {
            valid = false;
        }

        return value ?? '';
    }).trim();

    return valid && heading && !/[[\]|#^{}\r\n]/u.test(heading) ? heading : undefined;
}

function noteName(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
}

function ambiguousNoteNames(paths: ReadonlySet<string>): ReadonlySet<string> {
    const seen = new Set<string>();
    const ambiguous = new Set<string>();

    for (const path of paths) {
        const name = noteName(path).normalize().toLowerCase();

        if (seen.has(name)) {
            ambiguous.add(name);
        }

        seen.add(name);
    }

    return ambiguous;
}

export function renderReminders(day: string, section: Section, source: ReminderSource, dailyPath?: string): string {
    const paths = new Set(source.notePaths ?? source.notes.map(({ path }) => path));

    if (dailyPath !== undefined) {
        paths.add(dailyPath);
    }

    const ambiguous = ambiguousNoteNames(paths);
    const relativeRoot = '../'.repeat(dailyPath === undefined ? 0 : dailyPath.split('/').length - 1);
    const reminders: { target: string; heading: string | undefined; label: string; order: number }[] = [];
    const date = isoDayToUtcDate(day);
    const calendarDay = {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        date: date.getUTCDate(),
    };

    for (const { path, frontmatter } of source.notes) {
        const label = frontmatter[`${section}-reminder`];
        const target = path.replace(/\.md$/i, '');

        const invalidLabel = typeof label !== 'string' || !label.trim() || /[[\]|\r\n]/u.test(label);

        if (invalidLabel || /[[\]|#\r\n]/u.test(target)) {
            continue;
        }

        const schedule = section === 'day' ? frontmatter['day-reminder-schedule'] : undefined;

        if (schedule !== undefined && schedule !== null) {
            try {
                if (typeof schedule !== 'string') {
                    throw new Error('Expected a recurrence rule');
                }

                if (!ruleOccursOn(schedule, calendarDay)) {
                    continue;
                }
            } catch {
                source.onInvalidReminder?.(path, `${section}-reminder-schedule`);
                continue;
            }
        }

        const headingProperty = `${section}-reminder-heading`;
        const headingTemplate = frontmatter[headingProperty];
        let heading: string | undefined;

        if (headingTemplate !== undefined && headingTemplate !== null) {
            heading = typeof headingTemplate === 'string' ? expandReminderHeading(headingTemplate, day) : undefined;

            if (heading === undefined) {
                source.onInvalidReminder?.(path, headingProperty);
                continue;
            }
        }

        const order = frontmatter[`${section}-reminder-order`];

        reminders.push({
            target,
            heading,
            label: label.trim(),
            order: typeof order === 'number' && Number.isFinite(order) ? order : Infinity,
        });
    }

    return reminders
        .sort((left, right) => left.order - right.order || (left.target < right.target ? -1 : Number(left.target > right.target)))
        .map(({
            target, heading, label,
        }) => {
            const name = target.slice(target.lastIndexOf('/') + 1);
            let link = name;

            if (ambiguous.has(name.normalize().toLowerCase())) {
                link = target.includes('/') ? target : relativeRoot + target;
            }

            if (heading !== undefined) {
                link += `#${heading}`;
            }

            return `- [ ] [[${link}${link === label ? '' : `|${label}`}]]\n`;
        })
        .join('');
}
