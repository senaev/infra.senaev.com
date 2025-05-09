import { isString } from '../isString';

export type NonEmptyString = string;

/**
 * Проверяет, что аргумент - строка, причем непустая
 */
export function isNonEmptyString (str: unknown): str is string {
    return isString(str) && str.length > 0;
}

export function assertNonEmptyString(value: unknown): asserts value is NonEmptyString {
    if (!isNonEmptyString(value)) {
        throw new Error(`value=[${value}] is not a string or empty`);
    }
}
