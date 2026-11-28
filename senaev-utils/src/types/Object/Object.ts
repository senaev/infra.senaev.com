/**
 * Returns true for non-null objects, including arrays, and for functions.
 */
export function isObjectOrArray<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): value is T {
    const type = typeof value;

    return Boolean(value) && (type === 'object' || type === 'function');
}

export function assertObject<T extends Record<string, unknown> = Record<string, unknown>>(
    value: unknown,
    message?: string
): asserts value is T {
    if (!isObjectOrArray(value)) {
        let errorMessage = 'assertObject error';

        if (message !== undefined) {
            errorMessage += ` message=[${message}]`;
        }

        throw new Error(errorMessage);
    }
}
