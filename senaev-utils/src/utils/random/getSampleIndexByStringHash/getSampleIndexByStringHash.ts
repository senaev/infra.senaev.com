import { PositiveInteger } from '../../../types/Number/PositiveInteger';
import { UnsignedInteger } from '../../../types/Number/UnsignedInteger';
import { fnv1a } from '../fnv1a/fnv1a';

export function getSampleIndexByStringHash(str: string, samplesCount: PositiveInteger): UnsignedInteger {
    const bigint = fnv1a(str);
    const int = Number(bigint);

    return int % samplesCount;
}
