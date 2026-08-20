import { isObject } from '../../types/Object/Object';
import { isFunction } from '../Function/isFunction';
import { isString } from '../String/isString';

export function wrapError(error: unknown, {
    messageModifier,
}: Partial<{
    messageModifier: (oldMessage: string) => string;
}> = {}): Error {
    let resultError: Error;

    if (error instanceof Error) {
        resultError = error;
    } else {
        resultError = new Error('DEFAULT_ERROR_MESSAGE');
        if (isObject(error)) {
            if (isString(error.message)) {
                resultError.message = error.message;
            }

            if (isString(error.stack)) {
                resultError.stack = error.stack;
            }
        }
    }

    if (isFunction(messageModifier)) {
        resultError.message = messageModifier(resultError.message);
    }

    return resultError;
}
