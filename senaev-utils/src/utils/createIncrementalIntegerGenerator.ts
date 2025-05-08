import { PositiveInteger } from './Number/PositiveInteger';

export function createIncrementalIntegerGenerator(): () => PositiveInteger {
    let i = 0;

    return () => ++i;
}
