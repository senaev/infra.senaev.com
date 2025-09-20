import { PositiveInteger } from '../../../types/Number/PositiveInteger';
import { CircularBuffer } from '../../CircularBuffer/CircularBuffer';

/**
 * Calculates using accumulator to avoid re-calculating the mean
 * Can have small floating point errors
 */
export function simpleMovingAverageUsingAccFabric(windowSize: PositiveInteger): (value: number) => number | undefined {
    const queue = new CircularBuffer<number>(windowSize);
    let accumulator = 0;

    return (newValue: number) => {
        let diff = newValue;

        if (queue.length === windowSize) {
            diff -= queue.shift()!;
        }

        queue.push(newValue);

        accumulator += diff / windowSize;

        if (queue.length < windowSize) {
            return undefined;
        }

        return accumulator;
    };
}
