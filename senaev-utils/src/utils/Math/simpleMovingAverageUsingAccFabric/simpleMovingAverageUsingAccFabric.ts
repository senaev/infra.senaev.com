import { PositiveInteger } from '../../../types/Number/PositiveInteger';
import { Deque } from '../../Deque/Deque';

/**
 * Calculates using accumulator to avoid re-calculating the mean
 * Can have small floating point errors
 */
export function simpleMovingAverageUsingAccFabric(windowSize: PositiveInteger): (value: number) => number | undefined {
    const buffer = new Deque<number>();
    let accumulator = 0;

    return (newValue: number) => {
        let diff = newValue;

        buffer.push(newValue);

        if (buffer.length < windowSize) {
            accumulator += diff / windowSize;

            return undefined;
        }

        if (buffer.length > windowSize) {
            const removed = buffer.shift()!;

            diff -= removed;
        }

        accumulator += diff / windowSize;

        return accumulator;
    };
}
