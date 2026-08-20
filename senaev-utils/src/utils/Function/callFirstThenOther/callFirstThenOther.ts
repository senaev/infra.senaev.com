/**
 * Wrapper for a function that will be called first time with first function, and then with other function
 */

export function callFirstThenOther<T extends (
    this: unknown, ...args: unknown[]) => unknown>(
    this: unknown,
    first: T,
    other: T
): T {
    let called = false;

    const wrapper = function (this: unknown, ...args: unknown[]) {
        const fn = called ? other : first;

        called = true;

        return fn.apply(this, args);
    };

    return function (this: unknown, ...args: unknown[]) {
        return wrapper.apply(this, args);
    } as T;
}
