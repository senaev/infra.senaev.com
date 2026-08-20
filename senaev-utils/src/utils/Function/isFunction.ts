export function isFunction<T extends (...args: unknown[]) => unknown>(value: unknown): value is T {
    return typeof value === 'function';
}
