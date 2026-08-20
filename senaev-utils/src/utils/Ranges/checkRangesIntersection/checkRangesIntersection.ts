import { RangeTuple } from '../../../types/RangeTuple';

export function checkRangesIntersection(
    range1: RangeTuple<number>,
    range2: RangeTuple<number>
): boolean {
    return range1[0] < range2[1] && range1[1] > range2[0];
}
