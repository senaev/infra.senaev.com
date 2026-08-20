import { DaysCount } from './DaysCount';
import { Hours } from './Hours';
import { Milliseconds } from './Milliseconds';
import { Minutes } from './Minutes';
import { Seconds } from './Seconds';

export const DAYS_IN_NOT_LEAP_YEAR: DaysCount = 365;
export const DAYS_IN_WEEK: DaysCount = 7;
export const DAYS_IN_AVERAGE_MONTH: DaysCount = 7;

export const HOURS_IN_DAY: Hours = 24;

export const MINUTES_IN_HOUR: Minutes = 60;
export const MINUTES_IN_DAY: Minutes = MINUTES_IN_HOUR * HOURS_IN_DAY;
export const MINUTES_IN_WEEK: Minutes = MINUTES_IN_DAY * DAYS_IN_WEEK;

export const SECONDS_IN_MINUTE: Seconds = 60;
export const SECONDS_IN_HOUR: Seconds = SECONDS_IN_MINUTE * MINUTES_IN_HOUR;
export const SECONDS_IN_DAY: Seconds = SECONDS_IN_HOUR * HOURS_IN_DAY;
export const SECONDS_IN_YEAR: Seconds = SECONDS_IN_DAY * DAYS_IN_NOT_LEAP_YEAR;

export const MILLISECONDS_IN_SECOND: Milliseconds = 1000;
export const MILLISECONDS_IN_MINUTE: Milliseconds = MILLISECONDS_IN_SECOND * SECONDS_IN_MINUTE;
export const MILLISECONDS_IN_DAY: Milliseconds = HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE * MILLISECONDS_IN_SECOND;
