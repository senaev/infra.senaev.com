/**
 * Calls an array of functions with the given arguments
 */
export function callFunctions<T extends unknown[]>(
    functions: Iterable<((...callArgs: T) => unknown)>,
    ...args: T
): void {
    for (const func of functions) {
        func(...args);
    }
}
