import { Integer } from '../../../types/Number/Integer';

export const createIntegerSequenceArray = (start: Integer, end: Integer): Integer[] => Array.from({ length: end - start + 1 }, (_, i) => start + i);
