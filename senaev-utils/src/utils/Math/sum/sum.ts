import { IterableWithIndexAccess } from '../../../types/IterableWithIndexAccess';

/**
 * Stolen from here
 * https://github.com/simple-statistics/simple-statistics/blob/ac07cbec74534a4b4c71a541292e9ae8c26f0930/src/sum.js#L19C1-L56C2
 */
export function sum(x: IterableWithIndexAccess<number>): number {
    // If the array is empty, we needn't bother computing its sum
    if (x.length === 0) {
        return 0;
    }

    // Initializing the sum as the first number in the array
    let sumResult = x.at(0);

    // Keeping track of the floating-point error correction
    let correction = 0;

    let transition;

    if (typeof sumResult !== 'number') {
        return Number.NaN;
    }

    for (let i = 1; i < x.length; i++) {
        if (typeof x.at(i) !== 'number') {
            return Number.NaN;
        }

        transition = sumResult + x.at(i)!;

        // Here we need to update the correction in a different fashion
        // if the new absolute value is greater than the absolute sum
        if (Math.abs(sumResult) >= Math.abs(x.at(i)!)) {
            correction += sumResult - transition + x.at(i)!;
        } else {
            correction += x.at(i)! - transition + sumResult;
        }

        sumResult = transition;
    }

    // Returning the corrected sum
    return sumResult + correction;
}
