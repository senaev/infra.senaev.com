export function isString (value: unknown): value is string {
    // eslint-disable-next-line no-restricted-syntax -- Implementation of the type guard.
    return typeof value === 'string';
}
