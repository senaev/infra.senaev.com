import { isString } from '../../utils/String/isString';

/**
 * Целое число (положительное или отрицательное), представленное строкой
 * 💁‍♂️ '0'
 * 💁‍♂️ '-100500'
 * 💁‍♂️ '3456'
 */
export type IntegerInString = string;

export function isIntegerInString(str: unknown): boolean {
    return isString(str) && str === parseInt(str, 10).toString(10);
}
