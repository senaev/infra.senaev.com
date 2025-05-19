import { UnsignedInteger } from '../../Number/UnsignedInteger';

export const createArray = <T>(length: UnsignedInteger, value: T): T[] => Array.from({ length }, () => value);
