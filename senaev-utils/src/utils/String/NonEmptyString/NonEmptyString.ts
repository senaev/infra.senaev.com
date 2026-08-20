import { isString } from '../isString';

export type NonEmptyString = string;

/**
 * Проверяет, что аргумент - строка, причем непустая
 */
export function isNonEmptyString (str: unknown): str is string {
    return isString(str) && str.length > 0;
}

export function assertNonEmptyString(value: unknown, errorMessage?: string): asserts value is NonEmptyString {
    if (!isNonEmptyString(value)) {
        let message = `value=[${value}] is not a string or empty`;

        if (errorMessage) {
            message += ` message=[${errorMessage}]`;
        }

        throw new Error(message);
    }
}
