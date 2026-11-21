import { isoDayToUtcDate } from '../obsidianTasks/isoDay';

import { ruleOccursOn } from './ruleOccursOn';

export type ReminderNote = {
    path: string;
    frontmatter: Readonly<Record<string, unknown>>;
};

export type ReminderSource = {
    notes: readonly ReminderNote[];
    onInvalidSchedule?: (path: string) => void;
};

type Section = 'morning' | 'day' | 'evening';

export function hasReminder(frontmatter: ReminderNote['frontmatter']): boolean {
    return ([
        'morning',
        'day',
        'evening',
    ] as const).some((section) => typeof frontmatter[`${section}-reminder`] === 'string');
}

export function renderReminders(day: string, section: Section, source: ReminderSource): string {
    const reminders: { target: string; label: string; order: number }[] = [];
    const date = isoDayToUtcDate(day);
    const calendarDay = {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        date: date.getUTCDate(),
    };

    for (const { path, frontmatter } of source.notes) {
        const label = frontmatter[`${section}-reminder`];
        const target = path.replace(/\.md$/, '');

        if (typeof label !== 'string' || !label.trim() || /[[\]|\r\n]/u.test(label) || /[[\]|#\r\n]/u.test(target)) {
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
                source.onInvalidSchedule?.(path);
                continue;
            }
        }

        const order = frontmatter[`${section}-reminder-order`];

        reminders.push({
            target,
            label: label.trim(),
            order: typeof order === 'number' && Number.isFinite(order) ? order : Infinity,
        });
    }

    return reminders
        .sort((left, right) => left.order - right.order || (left.target < right.target ? -1 : Number(left.target > right.target)))
        .map(({ target, label }) => `- [ ] [[${target}|${label}]]\n`)
        .join('');
}
