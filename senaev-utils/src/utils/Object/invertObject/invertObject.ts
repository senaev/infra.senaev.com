import { InvertedObject } from './InvertedObject';

export function invertObject<T extends Record<string, string>>(object: T): InvertedObject<T> {
    const nextObject = {} as InvertedObject<T>;

    for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
            const value = object[key];

            (nextObject as Record<T[keyof T], keyof T>)[value] = key;
        }
    }

    return nextObject;
}
