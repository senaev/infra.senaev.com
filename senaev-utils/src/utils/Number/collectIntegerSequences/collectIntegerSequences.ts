import { Integer } from '../Integer';
import { PositiveInteger } from '../PositiveInteger';
import { UnsignedInteger } from '../UnsignedInteger';

type IntegerSequence = {
    start: UnsignedInteger;
    length: PositiveInteger;
};

export function collectIntegerSequences(integers: Integer[]): IntegerSequence[] {
    if (!integers.length) {
        return [];
    }

    const sequences: IntegerSequence[] = [
        {
            start: integers[0],
            length: 1,
        },
    ];

    for (let i = 1; i < integers.length; i += 1) {
        const lastSequence = sequences.at(-1)!;

        if (lastSequence.start + lastSequence.length === integers[i]) {
            lastSequence.length += 1;
        } else {
            sequences.push({
                start: integers[i],
                length: 1,
            });
        }
    }

    return sequences;
}
