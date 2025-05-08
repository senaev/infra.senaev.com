/**
 * Функция вызывает массив функций с аргументами
 */
export function callFunctions<T extends unknown[]>(
    functions: Iterable<((...callArgs: T) => unknown)>,
    ...args: T
): void {
    for (const func of functions) {
        if (typeof func === 'function') {
            func(...args);
        }
    }
}
