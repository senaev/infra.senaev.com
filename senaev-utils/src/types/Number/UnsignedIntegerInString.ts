import { isString } from '../../utils/String/isString';

/**
 * Unsigned int in string
 */
export type UnsignedIntegerInString = string;

export function isUnsignedIntegerInString(str: unknown): boolean {
    if (!isString(str)) {
        return false;
    }

    const int = parseInt(str, 10);

    if (str !== int.toString(10)) {
        return false;
    }

    return int >= 0;
}
