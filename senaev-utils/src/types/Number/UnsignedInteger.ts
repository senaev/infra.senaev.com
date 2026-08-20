/**
 * Целое неотрицательное число
 */
export type UnsignedInteger = number;

export function isUnsignedInteger(value: unknown): value is UnsignedInteger {
    if (!Number.isInteger(value)) {
        return false;
    }

    return (value as UnsignedInteger) >= 0;
}

export function assertUnsignedInteger(number: unknown, errorMessage: string = ''): asserts number is UnsignedInteger {
    if (!isUnsignedInteger(number)) {
        throw new Error(`Expected unsigned integer (whole number >= 0), got ${number}${errorMessage ? ` errorMessage=[${errorMessage}]` : ''}`);
    }
}

export function convertAndAssertUnsignedInteger(value: unknown): UnsignedInteger {
    const result = Number(value);

    if (isUnsignedInteger(result)) {
        return result;
    }

    throw new Error(`value=[${value}] is not unsigned integer`);
}
