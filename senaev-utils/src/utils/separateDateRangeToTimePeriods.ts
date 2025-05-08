import { addDays, isAfter } from 'date-fns';

import { RangeTuple } from '../types/RangeTuple';
import { DaysCount } from '../types/Time/DaysCount';

export function separateDateRangeToTimePeriods({
    since,
    until,
    intervalInDays,
}: {
    since: Date;
    until: Date;
    intervalInDays: DaysCount;
}): RangeTuple<Date>[] {
    let startOfNextPeriod = since;

    const periods: RangeTuple<Date>[] = [];

    while (true) {
        const from = startOfNextPeriod;

        const nextPeriodMoment = addDays(startOfNextPeriod, intervalInDays);
        const isLastPeriod = isAfter(nextPeriodMoment, until);
        const to = isLastPeriod ? until : nextPeriodMoment;

        periods.push([
            from,
            to,
        ]);

        if (isLastPeriod) {
            break;
        }

        startOfNextPeriod = to;
    }

    return periods;
}
