export type FiniteNumber = number;

export function isFiniteNumber(val: unknown): val is FiniteNumber {
    return Number.isFinite(val);
}

export function assertFiniteNumber(val: unknown, message?: string): asserts val is FiniteNumber {
    if (!isFiniteNumber(val)) {
        throw new Error(`assertFiniteNumber error${message ? ` message=[${message}]` : ''}`);
    }
}
