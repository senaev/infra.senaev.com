import { PositiveInteger } from '../types/Number/PositiveInteger';

export function createIncrementalIntegerGenerator(): () => PositiveInteger {
    let i = 0;

    return () => ++i;
}
