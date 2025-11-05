import { getObjectKeys } from '../getObjectKeys/getObjectKeys';

export function isEmptyObject<T extends Record<string, unknown>>(object: T): boolean {
    return !getObjectKeys(object).length;
}
