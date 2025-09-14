import { IterableWithIndexAccess } from '../../IterableWithIndexAccess';
import { sum } from '../sum/sum';

/**
 * Stolen from here
 * https://github.com/simple-statistics/simple-statistics/blob/ac07cbec74534a4b4c71a541292e9ae8c26f0930/src/mean.js#L17C1-L23C2
 */
export function mean(x: IterableWithIndexAccess<number>): number {
    if (x.length === 0) {
        throw new Error('mean requires at least one data point');
    }

    return sum(x) / x.length;
}
