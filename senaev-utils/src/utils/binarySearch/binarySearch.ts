import { UnsignedInteger } from '../Number/UnsignedInteger';

export function binarySearch(sortedArray: number[], value: number): UnsignedInteger | -1 {
    let left = 0;
    let right = sortedArray.length - 1;

    while (left <= right) {
        const middle = Math.floor((left + right) / 2);

        if (sortedArray[middle] === value) {
            return middle;
        }

        if (sortedArray[middle] < value) {
            left = middle + 1;
        } else {
            right = middle - 1;
        }
    }

    return -1;
}
