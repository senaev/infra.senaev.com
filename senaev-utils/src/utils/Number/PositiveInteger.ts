import { PositiveNumber } from '../../types/Number/PositiveNumber';
import { Integer } from './Integer';

/**
 * Целое положительное число
 */
export type PositiveInteger = PositiveNumber & Integer;

export function isPositiveInteger(value: unknown): value is PositiveInteger {
    if (!Number.isInteger(value)) {
        return false;
    }

    return (value as Integer) > 0;
}

export function assertPositiveInteger(value: unknown): asserts value is PositiveInteger {
    if (!isPositiveInteger(value)) {
        throw new Error(`value=[${value}] is not a positive integer`);
    }
}

export function convertAndAssertPositiveInteger(value: unknown): PositiveInteger {
    const result = Number(value);

    assertPositiveInteger(result);

    return result;
}
