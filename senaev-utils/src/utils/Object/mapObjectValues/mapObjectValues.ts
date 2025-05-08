import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

export function mapObjectValues<
    T extends Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- only for util snd better typing
    TMapFunc extends (value: T[keyof T], key: keyof T) => any,
    R extends { [P in keyof T]: ReturnType<TMapFunc> },
>(object: T, mapFunction: TMapFunc): R {
    const resultObject = {} as Record<string, unknown>;

    getObjectKeys(object).forEach((key) => {
        resultObject[key as string] = mapFunction(object[key], key);
    });

    return resultObject as R;
}
