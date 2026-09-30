import { RRule } from 'rrule';

import type { CalendarDay } from './calendarDay';

/**
 * Same convention as the senaev-personal-tools plugin: the rule is evaluated as if DTSTART
 * were 1 January of the requested year at 00:00 UTC. `FREQ` is required, `DTSTART` and
 * `COUNT` are rejected because they would mean something different under that convention.
 */
function parseRule(rule: string, year: number): RRule {
    const options = RRule.parseString(rule);

    if (options.freq === undefined || options.dtstart || options.count) {
        throw new Error('FREQ is required, DTSTART and COUNT are not supported');
    }

    const dtstart = new Date(0);

    dtstart.setUTCFullYear(year, 0, 1);

    return new RRule({
        ...options,
        dtstart,
    });
}

/** Throws for an invalid rule, so the caller decides how to report it. */
export function ruleOccursOn(rule: string, day: CalendarDay): boolean {
    const recurrence = parseRule(rule, day.year);
    const dayStart = new Date(0);

    dayStart.setUTCFullYear(day.year, day.month - 1, day.date);

    return recurrence.between(dayStart, dayStart, true).length > 0;
}
