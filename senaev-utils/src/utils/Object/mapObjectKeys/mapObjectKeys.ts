import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

/**
 * Функция принимает на вход первым агрументом объект и прогоняет все собственные свойства
 * (ключ и значение в качестве аргументов) через функцию, которая приходит вторым аргументом.
 * Эта функция для каждого свойства должна вернуть новый ключ для
 * конкретного значения объекта.
 *
 * Функция возвращает новый объект, со старыми значениями и новыми ключами.
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
