// use date.toISOString() method to convert date to this type

import { UnixTimeMs } from '../UnixTimeMs';
import { UnixTimeSec } from '../UnixTimeSec';

// 💁‍♂️ 2025-01-01T07:29:12.263Z
export type ISODateString = ReturnType<Date['toISOString']>;

export function isISODateString(date: string): boolean {
    const parsedDate = new Date(date);

    return !isNaN(parsedDate.getTime()) && date === parsedDate.toISOString();
}

export function assertISODateString(date: string, errorMessage?: string): asserts date is ISODateString {
    if (!isISODateString(date)) {
        throw new Error(`date=[${date}] is not a valid ISO date string${errorMessage ? ` errorMessage=[${errorMessage}]` : ''}`);
    }
}

export function isoDateStringToUnixTimeMs(date: ISODateString): UnixTimeMs {
    return new Date(date).getTime();
}

export function isoDateStringToUnixTimeSec(date: ISODateString): UnixTimeSec {
    return isoDateStringToUnixTimeMs(date) / 1000;
}
