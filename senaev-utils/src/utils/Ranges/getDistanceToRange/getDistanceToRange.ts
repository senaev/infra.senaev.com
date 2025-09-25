import { RangeTuple } from '../../../types/RangeTuple';

export function getDistanceToRange(range: RangeTuple<number>, value: number): number {
    if (value >= range[0] && value <= range[1]) {
        return 0;
    }

    if (value < range[0]) {
        return range[0] - value;
    }

    return value - range[1];
}
