import { isString } from '../../utils/String/isString';

/**
 * An integer (positive or negative) represented as a string
 * 💁‍♂️ '0'
 * 💁‍♂️ '-100500'
 * 💁‍♂️ '3456'
 */
export type IntegerInString = string;

export function isIntegerInString(str: unknown): boolean {
    return isString(str) && str === parseInt(str, 10).toString(10);
}
