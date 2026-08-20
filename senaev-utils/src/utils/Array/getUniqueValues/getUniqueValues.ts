export function getUniqueValues<T>(array: ReadonlyArray<T>): T[] {
    return array.filter((value, index, arr) => arr.indexOf(value) === index);
}
