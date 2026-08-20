import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

export function omitKeys<T extends Record<string, unknown>, K extends keyof T>(
    object: T,
    keysToOmit: readonly K[]
): Omit<T, K> {
    const resultObject = {} as Omit<T, K>;
    const keysToOmitSet = new Set<keyof T>(keysToOmit);

    getObjectKeys(object).forEach((key) => {
        if (!keysToOmitSet.has(key)) {
            resultObject[key as Exclude<keyof T, K>] = object[key] as Omit<T, K>[Exclude<keyof T, K>];
        }
    });

    return resultObject;
}
