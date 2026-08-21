export function binarySearch(sortedArray: number[], key: number): number {
    let left = 0;
    let right = sortedArray.length - 1;

    while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        // `left <= middle <= right` and `right < length`, so `middle` is in bounds.
        const middleValue = sortedArray[middle]!;

        if (middleValue === key) {
            return middle;
        }

        if (middleValue < key) {
            left = middle + 1;
        } else {
            right = middle - 1;
        }
    }

    return -1;
}
