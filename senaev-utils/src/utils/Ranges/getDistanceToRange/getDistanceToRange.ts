import { FiniteNumber } from '../../../types/Number/FiniteNumber';
import { RangeTuple } from '../../../types/RangeTuple';

export function getDistanceToRange(range: RangeTuple<FiniteNumber>, value: FiniteNumber): FiniteNumber {
    if (value >= range[0] && value <= range[1]) {
        return 0;
    }

    if (value < range[0]) {
        return value - range[0];
    }

    return value - range[1];
}
