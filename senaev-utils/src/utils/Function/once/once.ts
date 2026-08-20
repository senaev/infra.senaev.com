/**
 * Wrapper for a function that will be called no more than once
 *
 * Call context is preserved
 *
 * Subsequent calls return the result of the first call
 *
 * Subsequent recursive calls will not be executed either
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function once<T extends (this: any, ...args: any[]) => any>(this: any, fn: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let onceFn = function (this: any) {
        // Create variable in advance to avoid errors when accessing non-existent constant during call
        // eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
        let result: any;

        // Overwrite function in advance to avoid recursive call inside once
        onceFn = () => result;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
        result = fn.apply(this, arguments as any);

        return result;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function (this: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-rest-params
        return onceFn.apply(this, arguments as any);
    } as T;
}
