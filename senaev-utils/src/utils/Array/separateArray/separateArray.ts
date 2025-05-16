export function separateArray<T>(
    array: ReadonlyArray<T>,
    separateFunction: (value: T, index: number, currentArray: ReadonlyArray<T>) => boolean
): [T[], T[]] {
    const appropriate: T[] = [];
    const inappropriate: T[] = [];

    array.forEach((value, index) => {
        if (separateFunction(value, index, array)) {
            appropriate.push(value as T);
        } else {
            inappropriate.push(value);
        }
    });

    return [
        appropriate,
        inappropriate,
    ];
}
