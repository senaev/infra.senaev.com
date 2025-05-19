import { UnsignedInteger } from '../../Number/UnsignedInteger';

interface CreateArray {
    (length: UnsignedInteger): undefined[];
    <T>(length: UnsignedInteger, value: T): T[];
}

export const createArray: CreateArray = <T>(length: UnsignedInteger, value?: T) => Array.from({ length }, () => value);
