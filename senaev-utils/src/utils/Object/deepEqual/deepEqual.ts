import { isObject } from '../../../types/Object/Object';
import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

/**
 * Code taken from here https://gist.github.com/egardner/efd34f270cc33db67c0246e837689cb9
 *
 * The function is only suitable for comparing objects and arrays of any depth with primitives inside
 *
 * Not suitable for comparing complex objects such as Date, Function, RegExp, etc.
 * It treats them as plain objects and compares their own enumerable properties
 *
 * Returns false when comparing two NaN values
 */
export function deepEqual<T>(actual: unknown, expected: T): actual is T {
    if (actual === expected) {
        return true;
    }

    if (!isObject(actual) || !isObject(expected)) {
        return false;
    }

    if (Array.isArray(actual) !== Array.isArray(expected)) {
        return false;
    }

    const actualKeys = getObjectKeys(actual);
    const expectedKeys = getObjectKeys(expected);

    if (actualKeys.length !== expectedKeys.length) {
        return false;
    }

    for (const key of expectedKeys) {
        if (!((key as string) in actual)) {
            return false;
        }

        if (!deepEqual((actual as T)[key as keyof T], expected[key])) {
            return false;
        }
    }

    return true;
}
