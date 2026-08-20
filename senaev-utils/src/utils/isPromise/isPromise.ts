import { isObject } from '../../types/Object/Object';
import { isFunction } from '../Function/isFunction';

const isPromiseLike = (maybePromise: unknown): boolean => {
    if (!isObject(maybePromise)) {
        return false;
    }

    if (!isFunction(maybePromise.then)) {
        return false;
    }

    if (!isFunction(maybePromise.catch)) {
        return false;
    }

    if (!isFunction(maybePromise.finally)) {
        return false;
    }

    return true;
};

export const isPromise = <T extends Promise<PT>, PT>(maybePromise: unknown): maybePromise is T => {
    if (maybePromise instanceof Promise) {
        return true;
    }

    return isPromiseLike(maybePromise);
};
