export function isFunction<T extends (...args: unknown[]) => unknown>(value: unknown): value is T {
    // eslint-disable-next-line no-restricted-syntax -- Implementation of the type guard.
    return typeof value === 'function';
}
