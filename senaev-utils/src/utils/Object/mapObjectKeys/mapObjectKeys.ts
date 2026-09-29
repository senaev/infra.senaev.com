import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

/**
 * The function takes an object as its first argument and passes all its own properties
 * (key and value as arguments) through the function that comes as the second argument.
 * For each property, that function must return a new key for
 * that specific value of the object.
 *
 * The function returns a new object with the old values and the new keys.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapObjectKeys<T extends Record<string, any>, S extends string>(
    object: T,
    mapFunction: (key: keyof T, value: T[keyof T]) => S
): Record<S, T[keyof T]> {
    const resultObject = {} as Record<S, T[keyof T]>;

    getObjectKeys(object).forEach((key) => {
        const newKey = mapFunction(key, object[key]);

        resultObject[newKey] = object[key];
    });

    return resultObject;
}
