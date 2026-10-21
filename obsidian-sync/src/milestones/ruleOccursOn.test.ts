import {
    describe, expect, it,
} from 'vitest';

import type { CalendarDay } from './calendarDay';
import { ruleOccursOn } from './ruleOccursOn';

describe('invalid rules', () => {
    const ANY_DAY: CalendarDay = {
        year: 2026,
        month: 1,
        date: 1,
    };

    for (const rule of [
        '',
        'sometime in November',
        'BYMONTH=1;BYMONTHDAY=1',
        'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;COUNT=3',
        'DTSTART:20200101T000000Z\nRRULE:FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1',
    ]) {
        it(`throws: ${JSON.stringify(rule)}`, () => {
            expect(() => ruleOccursOn(rule, ANY_DAY)).toThrow();
        });
    }
});
