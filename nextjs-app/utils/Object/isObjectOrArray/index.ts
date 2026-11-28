/**
 * Returns true for non-null objects, including arrays, and for functions.
 */
export function isObjectOrArray<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): value is T {
    const type = typeof value;

    return Boolean(value) && (type === 'object' || type === 'function');
}
