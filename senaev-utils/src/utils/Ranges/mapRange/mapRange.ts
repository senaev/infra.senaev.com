import { RangeTuple } from '../../../types/RangeTuple';

export function mapRange<A, F extends (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: A, index: 0 | 1) => any, B extends ReturnType<F>>(
    range: RangeTuple<A>,
    func: F
): RangeTuple<B> {
    return [
        func(range[0], 0),
        func(range[1], 1),
    ];
}
