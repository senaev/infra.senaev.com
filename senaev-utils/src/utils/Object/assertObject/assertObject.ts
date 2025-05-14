import { isObject } from '../isObject/isObject';

export function assertObject<T extends Record<string, unknown> = Record<string, unknown>>(
    value: unknown,
    message?: string
): asserts value is T {
    if (!isObject(value)) {
        let errorMessage = 'assertObject error';

        if (message !== undefined) {
            errorMessage += ` message=[${message}]`;
        }

        throw new Error(errorMessage);
    }
}
