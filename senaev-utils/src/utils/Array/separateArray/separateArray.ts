export function separateArray<T>(
    array: Iterable<T>,
    separateFunction: (value: T, index: number, currentArray: Iterable<T>) => boolean
): [T[], T[]] {
    const suitable: T[] = [];
    const unsuitable: T[] = [];

    let index = 0;

    for (const value of array) {
        if (separateFunction(value, index, array)) {
            suitable.push(value as T);
        } else {
            unsuitable.push(value);
        }

        index++;
    }

    return [
        suitable,
        unsuitable,
    ];
}
