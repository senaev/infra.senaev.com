import { RangeTuple } from '../../../types/RangeTuple';

export function checkRangesAdjacent(
    range1: RangeTuple<number>,
    range2: RangeTuple<number>
): boolean {
    const [
        min1,
        max1,
    ] = [
        Math.min(range1[0], range1[1]),
        Math.max(range1[0], range1[1]),
    ];
    const [
        min2,
        max2,
    ] = [
        Math.min(range2[0], range2[1]),
        Math.max(range2[0], range2[1]),
    ];

    return max1 === min2 || max2 === min1;
}
