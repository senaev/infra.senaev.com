export function isBoolean(value: unknown): value is boolean {
    // eslint-disable-next-line no-restricted-syntax -- Implementation of the type guard.
    return typeof value === 'boolean';
}

export function assertBoolean(value: unknown, errorMessage?: string): asserts value is boolean {
    if (!isBoolean(value)) {
        throw new Error(`assert boolean error${errorMessage ? ` errorMessage=[${errorMessage}]` : ''}`);
    }
}
