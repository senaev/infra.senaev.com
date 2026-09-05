import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

/**
 * Maps every value of an object, keeping the key-to-value relation: the type of
 * each result key is derived from that key's own value type, not from the union
 * of all value types.
 */
export function mapObjectValues<
    T extends Record<string, unknown>,
    R extends Record<keyof T, unknown>,
>(object: T, mapFunction: <K extends keyof T>(value: T[K], key: K) => R[K]): R {
    const resultObject = {} as Record<keyof T, unknown>;

    getObjectKeys(object).forEach((key) => {
        resultObject[key] = mapFunction(object[key], key);
    });

    return resultObject as R;
}
