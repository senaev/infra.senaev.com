/**
 * Целое число
 */
export type Integer = number;

export function isInteger(value: unknown): value is Integer {
    return Number.isInteger(value);
}

export function assertInteger(value: unknown): asserts value is Integer {
    if (!isInteger(value)) {
        throw new Error(`value=[${value}] is not an integer`);
    }
}
