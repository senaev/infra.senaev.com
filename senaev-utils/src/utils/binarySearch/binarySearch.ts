export function binarySearch(sortedArray: number[], key: number): number {
    let left = 0;
    let right = sortedArray.length - 1;

    while (left <= right) {
        const middle = Math.floor((left + right) / 2);

        if (sortedArray[middle] === key) {
            return middle;
        }

        if (sortedArray[middle] < key) {
            left = middle + 1;
        } else {
            right = middle - 1;
        }
    }

    return -1;
}
