/**
 * Type-safe version of Promise.all(...)
 *
 * The parameter is a variadic tuple rather than a plain array so that an array
 * literal infers as a tuple: `promiseAll([a, b])` resolves to `[A, B]` and not
 * `(A | B)[]`, which is what makes indexing the result keep its element type.
 */
export function promiseAll<T extends readonly unknown[]>(promises: readonly [...T]): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
    return Promise.all(promises) as Promise<{ [K in keyof T]: Awaited<T[K]> }>;
}
