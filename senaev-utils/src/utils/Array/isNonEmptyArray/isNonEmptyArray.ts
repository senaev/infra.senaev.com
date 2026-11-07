/** Returns true if the value is an array containing at least one element. */
export function isNonEmptyArray(value: unknown): value is [unknown, ...unknown[]] {
    return Array.isArray(value) && value.length > 0;
}
