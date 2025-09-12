export function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

export function assertBoolean(value: unknown, errorMessage?: string): asserts value is boolean {
    if (!isBoolean(value)) {
        throw new Error(`assert boolean error${errorMessage ? ` errorMessage=[${errorMessage}]` : ''}`);
    }
}
