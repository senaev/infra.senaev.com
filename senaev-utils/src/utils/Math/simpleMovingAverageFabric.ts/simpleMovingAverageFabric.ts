import { PositiveInteger } from 'senaev-utils/src/types/Number/PositiveInteger';

import { Deque } from '../../Deque/Deque';
import { mean } from '../mean/mean';

export function simpleMovingAverageFabric(windowSize: PositiveInteger): (value: number) => number | undefined {
    const buffer = new Deque<number>();

    return (value: number) => {
        buffer.push(value);

        if (buffer.length < windowSize) {
            return undefined;
        }

        if (buffer.length > windowSize) {
            buffer.shift();
        }

        const result = mean(buffer);

        return result;
    };
}
