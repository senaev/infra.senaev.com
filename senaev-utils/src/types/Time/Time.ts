import { Hours } from './Hours';
import { Milliseconds } from './Milliseconds';
import { Minutes } from './Minutes';
import { Seconds } from './Seconds';

export const MS_IN_SEC: Milliseconds = 1000;
export const SEC_IN_MIN: Seconds = 60;
export const MIN_IN_HOUR: Minutes = 60;
export const HOUR_IN_DAY: Hours = 24;

export const SEC_IN_HOUR: Seconds = MIN_IN_HOUR * SEC_IN_MIN;
export const SEC_IN_DAY: Seconds = HOUR_IN_DAY * SEC_IN_HOUR;
export const MS_IN_DAY: Milliseconds = SEC_IN_DAY * MS_IN_SEC;
