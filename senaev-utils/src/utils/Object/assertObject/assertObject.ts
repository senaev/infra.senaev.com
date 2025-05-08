import { isObject } from '../isObject/isObject';

export function assertObject<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): asserts value is T {
    if (!isObject(value)) {
        throw new Error('Value is not an object');
    }
}
