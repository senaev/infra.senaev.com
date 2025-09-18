import { FiniteNumber, isFiniteNumber } from './FiniteNumber';

export type UnsignedFiniteNumber = FiniteNumber;

export function isUnsignedFiniteNumber(val: unknown): val is UnsignedFiniteNumber {
    return isFiniteNumber(val) && val >= 0;
}

export function assertUnsignedFiniteNumber(val: unknown, message?: string): asserts val is UnsignedFiniteNumber {
    if (!isUnsignedFiniteNumber(val)) {
        throw new Error(`assertUnsignedFiniteNumber error${message ? ` message=[${message}]` : ''}`);
    }
}
