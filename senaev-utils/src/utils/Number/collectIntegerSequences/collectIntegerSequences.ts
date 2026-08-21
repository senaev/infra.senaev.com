import { Integer } from '../../../types/Number/Integer';
import { PositiveInteger } from '../../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../../types/Number/UnsignedInteger';

type IntegerSequence = {
    start: UnsignedInteger;
    length: PositiveInteger;
};

export function collectIntegerSequences(integers: Integer[]): IntegerSequence[] {
    if (!integers.length) {
        return [];
    }

    // `integers` is non-empty (checked above), so index 0 and every `i` below
    // `integers.length` address a real element.
    const sequences: IntegerSequence[] = [
        {
            start: integers[0]!,
            length: 1,
        },
    ];

    for (let i = 1; i < integers.length; i += 1) {
        const lastSequence = sequences.at(-1)!;
        const current = integers[i]!;

        if (lastSequence.start + lastSequence.length === current) {
            lastSequence.length += 1;
        } else {
            sequences.push({
                start: current,
                length: 1,
            });
        }
    }

    return sequences;
}
