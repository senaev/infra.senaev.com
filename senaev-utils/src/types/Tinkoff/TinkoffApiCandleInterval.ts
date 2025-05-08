import { mirrorObject } from '../../util/Object/mirrorObject/mirrorObject';
import {
    DAYS_IN_AVERAGE_MONTH, DAYS_IN_NOT_LEAP_YEAR, DAYS_IN_WEEK,
} from '../Time/const';
import { DaysCount } from '../Time/DaysCount';

/**
 * Интервал не определён.
 */
export const TinkoffApiCandleIntervalUnspecified = 0;

/**
 * https://tinkoff.github.io/investAPI/marketdata/#candleinterval
 */
export const TinkoffApiCandleInterval = {
    CANDLE_INTERVAL_1_MIN: 1,
    CANDLE_INTERVAL_5_MIN: 2,
    CANDLE_INTERVAL_15_MIN: 3,
    CANDLE_INTERVAL_HOUR: 4,
    CANDLE_INTERVAL_DAY: 5,
    CANDLE_INTERVAL_2_MIN: 6,
    CANDLE_INTERVAL_3_MIN: 7,
    CANDLE_INTERVAL_10_MIN: 8,
    CANDLE_INTERVAL_30_MIN: 9,
    CANDLE_INTERVAL_2_HOUR: 10,
    CANDLE_INTERVAL_4_HOUR: 11,
    CANDLE_INTERVAL_WEEK: 12,
    CANDLE_INTERVAL_MONTH: 13,
} as const;

export const TinkoffApiCandleIntervalNames: {
    [key in TinkoffApiCandleIntervalName]: key;
} = mirrorObject(TinkoffApiCandleInterval);

export type TinkoffApiCandleIntervalName = keyof typeof TinkoffApiCandleInterval;
export type TinkoffApiCandleIntervalType = (typeof TinkoffApiCandleInterval)[TinkoffApiCandleIntervalName];

export const TinkoffApiCandleIntervalMaxDaysCount: Record<TinkoffApiCandleIntervalName, DaysCount> = {
    CANDLE_INTERVAL_1_MIN: 1,
    CANDLE_INTERVAL_2_MIN: 1,
    CANDLE_INTERVAL_3_MIN: 1,
    CANDLE_INTERVAL_5_MIN: 1,
    CANDLE_INTERVAL_10_MIN: 1,
    CANDLE_INTERVAL_15_MIN: 1,
    CANDLE_INTERVAL_30_MIN: 2,
    CANDLE_INTERVAL_HOUR: DAYS_IN_WEEK,
    CANDLE_INTERVAL_2_HOUR: DAYS_IN_AVERAGE_MONTH,
    CANDLE_INTERVAL_4_HOUR: DAYS_IN_AVERAGE_MONTH,
    CANDLE_INTERVAL_DAY: DAYS_IN_NOT_LEAP_YEAR,
    CANDLE_INTERVAL_WEEK: DAYS_IN_NOT_LEAP_YEAR * 2,
    CANDLE_INTERVAL_MONTH: DAYS_IN_NOT_LEAP_YEAR * 10,
};
