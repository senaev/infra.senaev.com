import { formatDuration, intervalToDuration } from 'date-fns';

import { MILLISECONDS_IN_MINUTE, MILLISECONDS_IN_SECOND } from '../types/Time/const';
import { Milliseconds } from '../types/Time/Milliseconds';

export function humanizeDuration(duration: Milliseconds): string {
    if (duration < MILLISECONDS_IN_MINUTE) {
        return `${Math.floor(duration / MILLISECONDS_IN_SECOND)} seconds`;
    }

    const now = new Date();
    const then = new Date(now.getTime() + duration);

    const durationObj = intervalToDuration({
        start: now,
        end: then,
    });
    return formatDuration(durationObj, { delimiter: ' ' });
}
