export function promiseAll<T extends unknown[]>(promises: T): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
    return Promise.all(promises);
}
