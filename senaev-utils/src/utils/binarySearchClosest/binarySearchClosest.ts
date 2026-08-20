import { UnsignedInteger } from '../../types/Number/UnsignedInteger';

export function binarySearchClosest<T>(
    sortedArray: T[],
    /**
     * return positive to search left, negative to search right, 0 to return index
     * for equal distances, returns lower index
     */
    compareFunction: (a: T) => number
): UnsignedInteger {
    if (sortedArray.length === 0) {
        throw new Error('Array must not be empty for binarySearchClosest function');
    }

    let left = 0;
    let right = sortedArray.length - 1;

    while (left < right - 1) {
        const midIndex = Math.floor((left + right) / 2);
        const midValue = sortedArray[midIndex];

        const compareResult = compareFunction(midValue);

        if (compareResult === 0) {
            return midIndex;
        }

        if (compareResult > 0) {
            right = midIndex;
        } else {
            left = midIndex;
        }
    }

    const leftDistance = Math.abs(compareFunction(sortedArray[left]));
    const rightDistance = Math.abs(compareFunction(sortedArray[right]));

    if (leftDistance > rightDistance) {
        return right;
    }

    return left;
}
