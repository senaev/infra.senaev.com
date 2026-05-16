export function separateArray<T>(
    array: Iterable<T>,
    separateFunction: (value: T, index: number, currentArray: Iterable<T>) => boolean
): [T[], T[]] {
    const appropriate: T[] = [];
    const inappropriate: T[] = [];

    let index = 0;

    for (const value of array) {
        if (separateFunction(value, index, array)) {
            appropriate.push(value as T);
        } else {
            inappropriate.push(value);
        }

        index++;
    }

    return [
        appropriate,
        inappropriate,
    ];
}
